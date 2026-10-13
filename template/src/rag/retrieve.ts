// ============================================================
// RAG core · lexical retrieval（语料无关）
// 词法检索：presence + IDF 打分（BM25 简化，零外部依赖）。
// 语料无关：不感知任何领域语汇，输入 query + Chunk[]，输出按分排序的 Chunk[]。
//
// 坏例迭代引入三处修复（保留理由，去掉领域例子）：
//   ① 索引标题（chunk.title 加权，默认 2×）——标题是人工密集摘要，
//      区分词常在标题而不在正文，只索引正文会永久丢这些词。
//   ② IDF 逆文档频率——纯 TF 时高频通用词淹没区分词，
//      导致"query 词几乎全在正文"仍排不进 top-k。
//   ③ 显式停用词表替代"长度>2"阈值——"长度>2"误杀域短词（缩写/短代号），
//      改停用词表保住 ≥2 字有意义词，只丢纯数字与单字符。
// ============================================================

import type { Chunk } from './chunker';

export interface RetrieveConfig {
  topK: number;
  minScore?: number;    // 低于该分不返回（默认 0，不设阈值）
  titleWeight?: number; // 标题词加权倍数（默认 2，标题是密集摘要）
}

// 英文停用词（显式表替代"长度>2"启发式，保留 ip/p1/p2 等域短词）
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does',
  'did', 'have', 'has', 'had', 'not', 'no', 'nor', 'so', 'as', 'it', 'its', 'this', 'that',
  'these', 'those', 'they', 'them', 'their', 'i', 'you', 'he', 'she', 'we', 'my', 'your',
  'our', 'his', 'her', 'what', 'why', 'how', 'when', 'where', 'which', 'who', 'whom',
  'whose', 'can', 'could', 'should', 'would', 'may', 'might', 'shall', 'will', 'must',
  'from', 'up', 'down', 'out', 'into', 'over', 'under', 'again', 'further', 'once', 'here',
  'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'only', 'own', 'same', 'than', 'too', 'very', 'just', 'about', 'against', 'between',
  'during', 'before', 'after', 'above', 'below', 'get', 'got', 'gets', 'getting',
]);

// 词条化：小写 → 按非字母数字切分 → 去停用词/单字符/纯数字
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

// 逆文档频率：df = 含该词的文档数。跨传入 chunks（即语料）统计，语料无关
function computeDf(chunks: Chunk[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const c of chunks) {
    const terms = new Set(tokenize(c.title + '\n' + c.text));
    for (const t of terms) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return df;
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

export function retrieve(query: string, chunks: Chunk[], config: RetrieveConfig): ScoredChunk[] {
  const qTerms = tokenize(query);
  if (qTerms.length === 0) return [];

  const N = chunks.length;
  const df = computeDf(chunks);
  const titleWeight = config.titleWeight ?? 2;

  const scored = chunks.map((chunk) => {
    const titleTerms = new Set(tokenize(chunk.title));
    const textTerms = new Set(tokenize(chunk.text));
    let score = 0;
    for (const term of qTerms) {
      const inTitle = titleTerms.has(term);
      const inText = textTerms.has(term);
      if (!inTitle && !inText) continue;
      const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      // 正文命中 = 基础信号；标题命中 = 加权加成。二者独立累加，互不清零。
      if (inText) score += idf;
      if (inTitle) score += idf * titleWeight;
    }
    return { chunk, score };
  });
  const minScore = config.minScore ?? 0;
  return scored
    .filter((r) => r.score > minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topK);
}