import { NextResponse } from 'next/server';
import pLimit from 'p-limit';
import { getDb, migrate } from '@/db';
import { processCandidate } from '@/lib/process';

export const runtime = 'nodejs';

interface CandidateIdRow {
  id: number;
}

/** POST /api/runs/[id]/process — kick off async processing of pending candidates. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) {
    return NextResponse.json({ error: 'invalid run id' }, { status: 400 });
  }
  migrate();
  const db = getDb();
  const run = db.prepare(`SELECT id, status FROM runs WHERE id = ?`).get(runId) as
    | { id: number; status: string }
    | undefined;
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  // 并发/重复触发守卫（P0）：只有 pending 或 stuck-processing 才允许启动。
  // 重复触发会让 done 被多次 +1 越过 total，前端轮询永远等不到 done 而卡死。
  if (run.status === 'processing') {
    return NextResponse.json({ error: 'run is already processing' }, { status: 409 });
  }
  if (run.status === 'done') {
    return NextResponse.json({ started: false, already_done: true, pending: 0 });
  }

  const pending = db
    .prepare(`SELECT id FROM candidates WHERE run_id = ? AND parse_status = 'pending'`)
    .all(runId) as CandidateIdRow[];

  if (pending.length === 0) {
    // 没有可处理的候选人（可能全部已完成或被中断）——直接收尾，避免空转卡 processing。
    db.prepare(
      `UPDATE runs SET status = 'done', finished_at = COALESCE(finished_at, datetime('now')) WHERE id = ?`
    ).run(runId);
    return NextResponse.json({ started: false, pending: 0 });
  }

  db.prepare(`UPDATE runs SET status = 'processing' WHERE id = ?`).run(runId);

  const limit = pLimit(5);
  void Promise.all(pending.map((c) => limit(() => processCandidate(c.id))))
    .then(() => {
      db.prepare(
        `UPDATE runs SET status = 'done', finished_at = datetime('now') WHERE id = ?`
      ).run(runId);
    })
    .catch(() => {
      db.prepare(
        `UPDATE runs SET status = 'done', finished_at = datetime('now') WHERE id = ?`
      ).run(runId);
    });

  return NextResponse.json({ started: true, pending: pending.length });
}
