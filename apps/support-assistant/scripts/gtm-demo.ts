#!/usr/bin/env tsx
// ============================================================
// GTM 适配验证：小样本达人语料 → 同一套 chunk/retrieve/evaluate 骨架
// 目的：证明"换语料只换 domain.ts + 语料文件"，检索/生成/评判骨架零改动。
// 语料：10 条 synthetic 达人 profile（明确标注 synthetic，非真实导出），
//       NP 硬编码进脚本仅为 demo——真实场景从 Excel 导出解析。
// 用法：tsx scripts/gtm-demo.ts
// ============================================================

import { chunkDoc, type CorpusDoc } from '../src/rag/chunker';
import { retrieve } from '../src/rag/retrieve';
import { evaluate, buildIndex } from '../src/rag/eval';
import type { GoldQA } from '../src/rag/goldset';

// 10 条 synthetic 达人 profile（消费品带货场景）
const syntheticDocs: CorpusDoc[] = [
  { id: 'inf01', title: 'inf01', text: 'creator A — tech gadget reviewer, 50k followers, 3% engagement, category: consumer-electronics, past: no brand-safety issues' },
  { id: 'inf02', title: 'inf02', text: 'creator B — beauty vlogger, 200k followers, 1% engagement, category: cosmetics, past: one ad disclosure complaint' },
  { id: 'inf03', title: 'inf03', text: 'creator C — gaming streamer, 80k followers, 4% engagement, category: mobile-gaming-accessories, past: clean' },
  { id: 'inf04', title: 'inf04', text: 'creator D — lifestyle blogger, 300k followers, 0.5% engagement, category: general, past: two disputed claims about product quality' },
  { id: 'inf05', title: 'inf05', text: 'creator E — DIY maker, 30k followers, 5% engagement, category: consumer-electronics, past: clean, high audience overlap with target brand' },
  { id: 'inf06', title: 'inf06', text: 'creator F — fitness coach, 500k followers, 2% engagement, category: health, past: clean but audience is off-category for electronics' },
  { id: 'inf07', title: 'inf07', text: 'creator G — phone review channel, 120k followers, 3.5% engagement, category: consumer-electronics, past: clean' },
  { id: 'inf08', title: 'inf08', text: 'creator H — travel vlogger, 90k followers, 1.5% engagement, category: travel, past: clean' },
  { id: 'inf09', title: 'inf09', text: 'creator I — audio gear reviewer, 60k followers, 4.5% engagement, category: consumer-electronics, past: clean' },
  { id: 'inf10', title: 'inf10', text: 'creator J — cooking channel, 150k followers, 2% engagement, category: food, past: clean' },
];

// 5 条 gold query → 期望命中的达人（基于 category + engagement 人工判定，非 LLM 猜）
const gtmGoldSet: GoldQA[] = [
  {
    id: 'gtm01',
    query: 'consumer electronics tech reviewer with clean record',
    goldDocIds: ['inf05', 'inf07', 'inf09', 'inf01'],
    reason: 'consumer-electronics category + clean，inf05 高 engagement overlap 首选',
  },
  {
    id: 'gtm02',
    query: 'mobile gaming accessories streamer',
    goldDocIds: ['inf03'],
    reason: 'inf03 是唯一 mobile-gaming-accessories',
  },
  {
    id: 'gtm03',
    query: 'creator with brand safety risk from past complaints',
    goldDocIds: ['inf04', 'inf02'],
    reason: 'inf04 disputed claims、inf02 ad disclosure，两者有品牌安全风险记录',
  },
  {
    id: 'gtm04',
    query: 'audio gear reviewer for electronics launch',
    goldDocIds: ['inf09'],
    reason: 'inf09 是唯一的 audio gear reviewer',
  },
  {
    id: 'gtm05',
    query: 'high engagement DIY maker for electronics brand',
    goldDocIds: ['inf05'],
    reason: 'inf05 DIY + consumer-electronics + 5% engagement 最高',
  },
];

function main() {
  const chunks = buildIndex(syntheticDocs);
  const { results, recallAtK, mrr } = evaluate(gtmGoldSet, chunks, 5);

  console.log('=== GTM demo: same retrieve/evaluate skeleton, synthetic influencer corpus ===');
  console.log(`docs: ${syntheticDocs.length} (synthetic demo data, not real exports)`);
  console.log(`recall@5: ${(recallAtK * 100).toFixed(1)}%`);
  console.log(`MRR: ${mrr.toFixed(3)}`);
  console.log('\n=== per-query ===');
  for (const r of results) {
    const mark = r.hit ? '✓' : '✗';
    console.log(`${mark} ${r.query}`);
    console.log(`   gold: ${r.goldDocIds.join(', ')}`);
    if (!r.hit) console.log(`   got:  ${r.retrievedDocIds.slice(0, 3).join(', ') || '(none)'}`);
  }

  // 一个检索演示：同一 retrieve 函数直接查达人语料
  console.log('\n=== sample retrieve: "electronics reviewer clean" ===');
  const demo = retrieve('electronics reviewer clean', chunks, { topK: 3 });
  demo.forEach((s, i) => console.log(`  ${i + 1}. ${s.chunk.docId} (score=${s.score.toFixed(3)})`));
}

main();