// 数据接入：上传评价 CSV → 存 uploads → 后台触发 Python 管道 → 返回 job id。
// 市场及格线#1（可重复数据接入）。前端轮询 /api/ingest/status?job=<id> 看进度。
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const ROOT = process.cwd(); // apps/voc-analysis
const UPLOADS = path.join(ROOT, 'pipeline', 'data', 'uploads');
const PY = path.join(ROOT, '.venv', 'Scripts', 'python.exe');

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: '缺少 file 字段' }, { status: 400 });
    }
    if (!/\.csv$/i.test(file.name)) {
      return NextResponse.json({ ok: false, error: '只支持 .csv（需含 text 列）' }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: '文件超过 20MB 上限' }, { status: 400 });
    }

    const job = randomUUID().slice(0, 8);
    await mkdir(UPLOADS, { recursive: true });
    await writeFile(path.join(UPLOADS, `${job}.csv`), buf);

    // 后台触发管道编排（detached，不阻塞响应；日志写 uploads/<job>.log）
    const child = spawn(PY, ['pipeline/run_ingestion.py', job], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    return NextResponse.json({ ok: true, job, rows: '管道已启动' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
