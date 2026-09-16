import fs from 'fs/promises';
import { PDFParse } from 'pdf-parse';

export interface PdfParseResult {
  text: string;
  needsManual: boolean;
}

/** Extract text from a PDF. <100 chars of text → treated as scanned, needsManual=true. */
export async function parsePdf(filePath: string): Promise<PdfParseResult> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    return { text, needsManual: text.length < 100 };
  } finally {
    await parser.destroy();
  }
}
