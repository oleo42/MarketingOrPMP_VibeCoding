// ============================================================
// 通用文件文本解析（四段式 · 第 1 段"数据接入"的最后一公里）
// 模式核心：解析失败的文件不丢、不中断批次，
// 而是标记 needsManual=true 让条目流入人工补录通道——
// "AI 处理 80%，人兜住 20%"是四段式的设计哲学。
// 从 resume-screening 的 pdf.ts 泛化：阈值判断 + 状态标记保留，
// 解析器本身按数据类型替换（PDF/Excel/纯文本各一个函数）。
// ============================================================
import fs from 'fs/promises';
import { PDFParse } from 'pdf-parse';

export interface FileParseResult {
  text: string;
  needsManual: boolean;
}

/**
 * PDF → 纯文本。抽取字符数 < minTextLength 判定为扫描件/图片型 PDF，
 * 返回 needsManual=true（LLM 读不出东西，需要人工处理或 OCR 升级）。
 */
export async function parsePdf(filePath: string, minTextLength = 100): Promise<FileParseResult> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    return { text, needsManual: text.length < minTextLength };
  } finally {
    await parser.destroy();
  }
}

/** 纯文本/Markdown/转写稿：直接读文件，过短同样进人工通道。 */
export async function parseTextFile(
  filePath: string,
  minTextLength = 20
): Promise<FileParseResult> {
  const text = (await fs.readFile(filePath, 'utf8')).trim();
  return { text, needsManual: text.length < minTextLength };
}

// Excel 接入：大多数业务系统的数据源是"平台导出的 Excel"（三条红线之三）。
// 推荐 xlsx 包：sheet_to_json 后直接把每行作为一个 item 插入 items 表，
// 无需逐行 LLM 解析——Excel 本身已是结构化的，LLM 只做打分/生成。
