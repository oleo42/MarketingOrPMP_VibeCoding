// ============================================================
// ingest：读脱敏后语料 JSONL → CorpusDoc → chunk → JSONL
// 语料无关：只依赖 src/rag/ 的纯函数（parseCaseFile / chunkDoc）。
//
// ⚠️ 输入必须是 scripts/desensitize.py 产出的【已脱敏】文本。
// ingest 不再读 vault 原始 md：脱敏只能由 desensitize.py 单点完成，
// 否则本路径会泄露组织名/人名/租户/GUID 等 PII。
//
// 用法：tsx scripts/ingest.ts --corpus data/corpus.jsonl [--out data] [--strategy by-file]
// ============================================================
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseCaseFile } from '../src/rag/corpus';
import { chunkDoc, type ChunkStrategy, type CorpusDoc } from '../src/rag/chunker';

interface Args {
  corpus: string;
  out: string;
  strategy: ChunkStrategy;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, def: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  return {
    corpus: get('corpus', 'data/corpus.jsonl'),
    out: get('out', 'data'),
    strategy: (get('strategy', 'by-file') as ChunkStrategy),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  // 读脱敏后的 corpus.jsonl（desensitize.py 产出），不再读 vault 原始 md
  const docs = readFileSync(args.corpus, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { id: string; title: string; text: string })
    .map((d) => parseCaseFile(d.text, d.id + '.md'))
    .filter((d): d is CorpusDoc => d !== null);

  const chunks = docs.flatMap((d) => chunkDoc(d, { strategy: args.strategy }));

  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, 'corpus.jsonl'), docs.map((d) => JSON.stringify(d)).join('\n'));
  writeFileSync(join(args.out, 'chunks.jsonl'), chunks.map((c) => JSON.stringify(c)).join('\n'));

  console.log(JSON.stringify({ docs: docs.length, chunks: chunks.length, strategy: args.strategy, out: args.out }, null, 2));
}

main();