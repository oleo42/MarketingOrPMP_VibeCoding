import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getDb, migrate } from '@/db';

export const runtime = 'nodejs';

/** POST /api/runs — multipart/form-data: jd_text + files[]. Creates run + candidates. */
export async function POST(request: Request) {
  migrate();
  const form = await request.formData();
  const jdText = form.get('jd_text');
  if (typeof jdText !== 'string' || jdText.trim().length === 0) {
    return NextResponse.json({ error: 'jd_text is required' }, { status: 400 });
  }
  // JD 长度上限（P2）：防止超长输入拖慢 LLM 并撑爆 token。
  if (jdText.length > 8000) {
    return NextResponse.json({ error: 'jd_text too long (max 8000 chars)' }, { status: 400 });
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'at least one PDF file is required' }, { status: 400 });
  }
  if (files.length > 50) {
    return NextResponse.json({ error: 'too many files (max 50)' }, { status: 400 });
  }
  // PDF 魔数校验（P1）：拒绝非 PDF/伪装扩展名文件，避免处理期变 failed 污染队列。
  // 真实 PDF 以 "%PDF-" 开头。逐个读前 5 字节，任一不符即整批拒绝并指明文件名。
  // 先一次性读出所有 buffer（校验与写盘复用，避免 arrayBuffer 读两遍浪费内存）。
  const buffers = new Map<File, Buffer>();
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const head = buf.subarray(0, 5).toString('latin1');
    if (head !== '%PDF-') {
      return NextResponse.json(
        { error: `"${file.name}" 不是有效的 PDF 文件（缺少 %PDF 文件头）` },
        { status: 400 }
      );
    }
    if (buf.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: `"${file.name}" 超过 10MB 大小限制` }, { status: 400 });
    }
    buffers.set(file, buf);
  }

  const db = getDb();
  const runId = db
    .prepare(`INSERT INTO runs (jd_text, total, status) VALUES (?, ?, 'pending')`)
    .run(jdText, files.length).lastInsertRowid as number;

  const uploadDir = path.join(process.cwd(), 'uploads', String(runId));
  await fs.mkdir(uploadDir, { recursive: true });

  const insertCandidate = db.prepare(
    `INSERT INTO candidates (run_id, filename, file_path, parse_status) VALUES (?, ?, ?, 'pending')`
  );
  for (const file of files) {
    const safeName = path.basename(file.name);
    const filePath = path.join(uploadDir, safeName);
    await fs.writeFile(filePath, buffers.get(file)!);
    insertCandidate.run(runId, safeName, filePath);
  }

  return NextResponse.json({ run_id: runId }, { status: 201 });
}
