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
  const run = db.prepare(`SELECT id FROM runs WHERE id = ?`).get(runId);
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  const pending = db
    .prepare(`SELECT id FROM candidates WHERE run_id = ? AND parse_status = 'pending'`)
    .all(runId) as CandidateIdRow[];

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
