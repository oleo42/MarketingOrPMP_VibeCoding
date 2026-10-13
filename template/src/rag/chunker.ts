// ============================================================
// RAG core · chunker（语料无关）
// 三种切分策略，由 ChunkConfig.strategy 选：
//   by-file   —— 一个 CorpusDoc 一个 chunk（答案是文档级、跨多 heading 分布时用，不能按 heading 切）
//   by-heading—— 按 markdown heading 切（产品手册用：章节是天然语义边界）
//   by-size   —— 定长切分 + 重叠（无结构文本兜底）
// 泛化点：切分是纯函数，输入 CorpusDoc[]、输出 Chunk[]，不感知任何领域语汇。
// ============================================================

export interface CorpusDoc {
  id: string;          // 文档唯一 id（如文件名去扩展名）
  title: string;       // 展示标题（如文档描述性标题）
  text: string;        // 全文
}

export interface Chunk {
  id: string;          // `${docId}:${chunkIndex}`
  docId: string;
  title: string;
  text: string;
  meta: { index: number; total: number };
}

export type ChunkStrategy = 'by-file' | 'by-heading' | 'by-size';

export interface ChunkConfig {
  strategy: ChunkStrategy;
  maxChars?: number;    // by-size 目标长度，默认 1200
  overlapChars?: number; // by-size 重叠，默认 150
}

export function chunkDoc(doc: CorpusDoc, config: ChunkConfig): Chunk[] {
  switch (config.strategy) {
    case 'by-file':
      return doc.text.trim() === '' ? [] : [buildChunk(doc.id, doc.title, 0, 1, doc.text)];
    case 'by-heading':
      return byHeading(doc);
    case 'by-size':
      return bySize(doc, config);
    default:
      throw new Error(`Unknown chunk strategy: ${config.strategy}`);
  }
}

export function chunkAll(docs: CorpusDoc[], config: ChunkConfig): Chunk[] {
  return docs.flatMap((d) => chunkDoc(d, config));
}

function buildChunk(docId: string, title: string, index: number, total: number, text: string): Chunk {
  return { id: `${docId}:${index}`, docId, title, text, meta: { index, total } };
}

// ---------- by-heading：按 markdown heading（行首 #...空格）切 ----------
function byHeading(doc: CorpusDoc): Chunk[] {
  const lines = doc.text.split('\n');
  const groups: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (current.length > 0) groups.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) groups.push(current.join('\n'));
  // 丢弃只有 heading 无正文的空壳 chunk（如空的 ## cause）
  const full = groups.filter((g) => g.replace(/^#{1,6}\s+.*$/gm, '').trim() !== '');
  return full.map((text, i) => buildChunk(doc.id, doc.title, i, full.length, text));
}

// ---------- by-size：定长 + 重叠切分 ----------
function bySize(doc: CorpusDoc, config: ChunkConfig): Chunk[] {
  const maxChars = config.maxChars ?? 1200;
  const overlapChars = config.overlapChars ?? 150;
  const text = doc.text;
  if (text.trim() === '') return [];
  if (text.length <= maxChars) return [buildChunk(doc.id, doc.title, 0, 1, text)];

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      // 回退到最近的换行，避免切断句子
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > start + maxChars / 2) end = lastNewline;
    }
    const slice = text.slice(start, Math.min(end, text.length));
    chunks.push(buildChunk(doc.id, doc.title, chunks.length, 0, slice));
    if (end >= text.length) break;
    start = end - overlapChars;
  }
  chunks.forEach((c) => (c.meta.total = chunks.length));
  return chunks;
}