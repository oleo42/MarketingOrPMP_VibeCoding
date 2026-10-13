#!/usr/bin/env tsx
// 对照实验：title 权重对 recall 的贡献（验证 64%→100% 是否靠 title 循环而非真实检索）
import { readFileSync } from 'fs';
import { goldSet } from '../src/rag/goldset';
import { retrieve } from '../src/rag/retrieve';
import { chunkDoc } from '../src/rag/chunker';

const docs = readFileSync('D:/projects/MarketingOrPMP_VibeCoding/apps/support-assistant/data/corpus.jsonl', 'utf-8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as { id: string; title: string; text: string });

const chunks = docs.flatMap((d) => chunkDoc(d, { strategy: 'by-file' }));

function recallAt(topK: number, titleWeight: number): number {
  let hits = 0;
  for (const g of goldSet) {
    const res = retrieve(g.query, chunks, { topK, titleWeight });
    const ids = res.map((r) => r.chunk.docId);
    if (g.goldDocIds.some((x) => ids.includes(x))) hits++;
  }
  return hits / goldSet.length;
}

console.log('recall@5  titleWeight=0 (pure content):', (recallAt(5, 0) * 100).toFixed(1) + '%');
console.log('recall@5  titleWeight=1 (content+title):', (recallAt(5, 1) * 100).toFixed(1) + '%');
console.log('recall@5  titleWeight=2 (current):      ', (recallAt(5, 2) * 100).toFixed(1) + '%');
console.log('recall@10 titleWeight=0 (pure content):', (recallAt(10, 0) * 100).toFixed(1) + '%');

// 逐个看 titleWeight=0 时还 miss 哪些
const misses = goldSet.filter((g) => {
  const res = retrieve(g.query, chunks, { topK: 5, titleWeight: 0 });
  return !g.goldDocIds.some((x) => res.map((r) => r.chunk.docId).includes(x));
});
console.log('\nmiss @titleWeight=0:', misses.length);
for (const m of misses) console.log('  ', m.id, JSON.stringify(m.query), '->', m.goldDocIds.join(','));