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
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'at least one PDF file is required' }, { status: 400 });
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
    await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    insertCandidate.run(runId, safeName, filePath);
  }

  return NextResponse.json({ run_id: runId }, { status: 201 });
}
