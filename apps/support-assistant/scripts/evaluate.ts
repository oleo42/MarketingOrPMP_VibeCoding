#!/usr/bin/env tsx
// ============================================================
// evaluate：gold set → 检索指标（recall@k + MRR）
// 用法：tsx scripts/evaluate.ts --corpus data/corpus.jsonl [--topK 5]
// ============================================================
import { readFileSync } from 'fs';
import { goldSet } from '../src/rag/goldset';
import { evaluate, buildIndex } from '../src/rag/eval';

interface Args {
  corpus: string;
  topK: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, def: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  return { corpus: get('corpus', 'data/corpus.jsonl'), topK: parseInt(get('topK', '5'), 10) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const docs = readFileSync(args.corpus, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { id: string; title: string; text: string });

  const chunks = buildIndex(docs);
  const { results, recallAtK, mrr } = evaluate(goldSet, chunks, args.topK);

  console.log(`=== retrieval metrics (topK=${args.topK}) ===`);
  console.log(`recall@${args.topK}: ${(recallAtK * 100).toFixed(1)}%`);
  console.log(`MRR: ${mrr.toFixed(3)}`);
  console.log(`\n=== per-query (misses only) ===`);
  for (const r of results) {
    if (!r.hit) {
      console.log(`❌ ${r.id} "${r.query}"`);
      console.log(`   gold: ${r.goldDocIds.join(', ')}`);
      console.log(`   got:  ${r.retrievedDocIds.slice(0, 3).join(', ') || '(none)'}`);
    }
  }
  const hits = results.filter((r) => r.hit).length;
  console.log(`\n${hits}/${results.length} queries hit a gold doc in top-${args.topK}`);
}

main();