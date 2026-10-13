// ============================================================
// RAG core · corpus loader（语料无关）
// 职责：把 case 文本包装成 CorpusDoc。case 判定以 `#case` 开头标记。
//
// ⚠️ 脱敏的单一真相源 = scripts/desensitize.py（10 步规则，零泄露验证通过）。
// 本文件【不】嵌入脱敏规则——两套脱敏并存会让 ingest 路径静默泄露
// 组织名/人名/租户/GUID 等 PII。
// 数据流：vault 原始 md → scripts/desensitize.py → data/corpus.jsonl
//         → retrieve/evaluate 直接消费 corpus.jsonl（已是脱敏文本）。
// ============================================================

import type { CorpusDoc } from './chunker';

// case 文件以 `#case` 开头标记这是一份排障案例；全文作为一个 CorpusDoc（by-file 切分）。
// 入参 content 必须是【已脱敏】文本（脱敏由 scripts/desensitize.py 完成，见文件头）。
export function parseCaseFile(content: string, filename: string): CorpusDoc | null {
  const isCase = /^#case\b/m.test(content);
  if (!isCase) return null;
  return {
    id: filename.replace(/\.md$/i, ''),
    title: filename.replace(/\.md$/i, ''),
    text: content,
  };
}

// 批量：传入多条 case 文本（含非 case 文件时静默跳过）
export function parseCaseFiles(files: Array<{ filename: string; content: string }>): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  for (const f of files) {
    const doc = parseCaseFile(f.content, f.filename);
    if (doc) docs.push(doc);
  }
  return docs;
}