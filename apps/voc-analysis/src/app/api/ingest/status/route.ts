// 查询上传任务的管道进度。前端轮询直到 stage=done/error。
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const UPLOADS = path.join(process.cwd(), 'pipeline', 'data', 'uploads');

export async function GET(req: Request) {
  const job = new URL(req.url).searchParams.get('job') ?? '';
  if (!/^[a-z0-9-]{4,16}$/.test(job)) {
    return NextResponse.json({ ok: false, error: 'job 无效' }, { status: 400 });
  }
  try {
    const raw = await readFile(path.join(UPLOADS, `${job}.status.json`), 'utf-8');
    return NextResponse.json({ ok: true, ...JSON.parse(raw) });
  } catch {
    return NextResponse.json({ ok: true, job, stage: 'starting' });
  }
}
