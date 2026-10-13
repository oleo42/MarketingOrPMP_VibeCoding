#!/usr/bin/env tsx
// ============================================================
// query-demo：单 query 检索演示——输入自然语言排障问题，输出 top-k 结果。
// 用途：demo 视频现场演示 + 人工抽查检索质量。
// 用法（从 apps/resume-screening 跑）：
//   npx --no-install tsx ../support-assistant/scripts/query-demo.ts "<你的问题>" [--topK 5]
// ============================================================
import { readFileSync } from 'fs';
import { retrieve } from '../src/rag/retrieve';
import { chunkDoc } from '../src/rag/chunker';

const argv = process.argv.slice(2);
const get = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
// 位置参数（非 -- 开头）拼成 query；也可 --query "..."
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--topK' && argv[i - 1] !== '--corpus' && argv[i - 1] !== '--query');
const query = positional.join(' ') || get('query', '');
const topK = parseInt(get('topK', '5'), 10);
const corpusPath = get('corpus', 'D:/projects/MarketingOrPMP_VibeCoding/apps/support-assistant/data/corpus.jsonl');

if (!query.trim()) {
  console.error('用法: tsx query-demo.ts "<排障问题>" [--topK 5]');
  process.exit(1);
}

const docs = readFileSync(corpusPath, 'utf-8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as { id: string; title: string; text: string });
const chunks = docs.flatMap((d) => chunkDoc(d, { strategy: 'by-file' }));

const results = retrieve(query, chunks, { topK });

console.log(`Query: ${query}`);
console.log(`Corpus: ${docs.length} docs | top ${topK}\n`);
if (results.length === 0) {
  console.log('(no hits — 没有任何 case 与 query 共享检索词)');
}
for (const [i, r] of results.entries()) {
  // 正文取首个非空、非 heading 行作为摘要片段
  const snippet =
    r.chunk.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .slice(0, 2)
      .join(' / ')
      .slice(0, 140) || '(empty body)';
  console.log(`${i + 1}. [score ${r.score.toFixed(2)}] ${r.chunk.docId}`);
  console.log(`   ${snippet}\n`);
}