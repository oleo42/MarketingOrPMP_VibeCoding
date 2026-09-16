import { NextResponse } from 'next/server';
import { getDb, migrate } from '@/db';
import { toCsv } from '@/lib/csv';

export const runtime = 'nodejs';

interface CandidateRow {
  filename: string;
  extract_json: string | null;
  score_json: string | null;
  ai_verdict: string | null;
  ai_score: number | null;
  human_verdict: string | null;
  human_note: string | null;
}

/** GET /api/runs/[id]/export — download screening results as CSV. */
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
  const run = db.prepare(`SELECT id FROM runs WHERE id = ?`).get(runId);
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }
  const rows = db
    .prepare(`SELECT * FROM candidates WHERE run_id = ? ORDER BY id`)
    .all(runId) as CandidateRow[];

  const csvRows = rows.map((c) => {
    const extract = c.extract_json ? (JSON.parse(c.extract_json) as Record<string, unknown>) : null;
    const score = c.score_json ? (JSON.parse(c.score_json) as Record<string, unknown>) : null;
    const risks = Array.isArray(score?.risks) ? (score.risks as string[]).join('; ') : '';
    return {
      姓名: extract?.name ?? '',
      年限: extract?.years_experience ?? '',
      AI档位: c.ai_verdict ?? '',
      人工档位: c.human_verdict ?? '',
      分数: c.ai_score ?? '',
      理由: score?.reason ?? '',
      风险点: risks,
      备注: c.human_note ?? '',
      文件名: c.filename,
    };
  });

  const csv = '﻿' + toCsv(csvRows);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=run_${runId}.csv`,
    },
  });
}
