import { NextResponse } from 'next/server';
import { getDb, migrate } from '@/db';

export const runtime = 'nodejs';

interface CandidateRow {
  id: number;
  filename: string;
  parse_status: string;
  extract_json: string | null;
  score_json: string | null;
  ai_verdict: string | null;
  ai_score: number | null;
  human_verdict: string | null;
  human_note: string | null;
}

/** GET /api/runs/[id] — run metadata + candidate list. */
export async function GET(
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
  const run = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId);
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }
  const rows = db
    .prepare(`SELECT * FROM candidates WHERE run_id = ? ORDER BY id`)
    .all(runId) as CandidateRow[];

  const candidates = rows.map((c) => {
    const extract = c.extract_json ? (JSON.parse(c.extract_json) as Record<string, unknown>) : null;
    const score = c.score_json ? (JSON.parse(c.score_json) as Record<string, unknown>) : null;
    return {
      id: c.id,
      filename: c.filename,
      parse_status: c.parse_status,
      name: extract?.name ?? null,
      years_experience: extract?.years_experience ?? null,
      ai_verdict: c.ai_verdict,
      ai_score: c.ai_score,
      human_verdict: c.human_verdict,
      human_note: c.human_note,
      reason: score?.reason ?? null,
    };
  });

  return NextResponse.json({ run, candidates });
}

/**
 * PATCH /api/runs/[id] — { reset_processing: true }
 * D4 恢复前置：把 stuck 的 processing 复位为 pending，使 process 路由的并发守卫放行。
 * 仅在 status='processing' 时有效（中断的后台任务不会自己复位）；其余状态幂等返回当前状态。
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) {
    return NextResponse.json({ error: 'invalid run id' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { reset_processing?: boolean } | null;
  if (!body?.reset_processing) {
    return NextResponse.json({ error: 'only reset_processing is supported' }, { status: 400 });
  }
  migrate();
  const db = getDb();
  const run = db.prepare(`SELECT id, status FROM runs WHERE id = ?`).get(runId) as
    | { id: number; status: string }
    | undefined;
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }
  if (run.status === 'processing') {
    db.prepare(`UPDATE runs SET status = 'pending' WHERE id = ?`).run(runId);
  }
  return NextResponse.json({ ok: true, status: run.status === 'processing' ? 'pending' : run.status });
}
