// ============================================================
// 检索指标：recall@k + MRR（语料无关）
// 输入：gold set（query → goldDocIds）+ chunk 索引 + 检索 config
// 输出：每条 query 的命中结果 + 汇总 recall@k / MRR。
// 语料无关：不感知领域，只算"gold 是否被检索到 / 排名"。
// ============================================================

import { retrieve, type ScoredChunk } from './retrieve';
import { chunkDoc, type Chunk } from './chunker';

// GoldQA 是检索评测的输入契约（query → 期望命中的 docId 集），
// 定义在 eval（消费方）而非 goldset（数据方），保持 core 不依赖领域数据。
export interface GoldQA {
  id: string;
  query: string;
  goldDocIds: string[];   // 命中即算对（召回 = gold 中被检索到的比例）
  reason: string;
}

export interface EvalResult {
  id: string;
  query: string;
  retrievedDocIds: string[];
  goldDocIds: string[];
  hit: boolean;                    // 任一 gold 在 top-k 中
  reciprocalRank: number;          // 1/第一个 gold 的排名，未命中=0
  rank: number | null;             // 首个 gold 的排名（1-based），未命中=null
}

export function evaluate(
  goldSet: GoldQA[],
  chunks: Chunk[],
  topK: number,
  minScore?: number
): { results: EvalResult[]; recallAtK: number; mrr: number } {
  const results = goldSet.map((g) => {
    const scored = retrieve(g.query, chunks, { topK, minScore });
    const retrievedDocIds = scored.map((s) => s.chunk.docId);
    const rank = firstGoldRank(retrievedDocIds, g.goldDocIds);
    return {
      id: g.id,
      query: g.query,
      retrievedDocIds,
      goldDocIds: g.goldDocIds,
      hit: rank !== null,
      reciprocalRank: rank != null ? 1 / rank : 0,
      rank,
    };
  });

  const recallAtK =
    results.filter((r) => r.hit).length / (results.length || 1);
  const mrr = results.reduce((sum, r) => sum + r.reciprocalRank, 0) / (results.length || 1);

  return { results, recallAtK, mrr };
}

function firstGoldRank(retrieved: string[], gold: string[]): number | null {
  for (let i = 0; i < retrieved.length; i++) {
    if (gold.includes(retrieved[i])) return i + 1;
  }
  return null;
}

// 便捷：从 corpus docs 直接建 chunk 索引（by-file，每个 doc 一个 chunk）
export function buildIndex(docs: Array<{ id: string; title: string; text: string }>): Chunk[] {
  return docs.flatMap((d) => chunkDoc(d, { strategy: 'by-file' }));
}