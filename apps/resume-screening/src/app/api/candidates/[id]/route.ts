import { NextResponse } from 'next/server';
import { getDb, migrate } from '@/db';

export const runtime = 'nodejs';

/** PATCH /api/candidates/[id] — human verdict override. body: {human_verdict?, human_note?} */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const candidateId = Number(id);
  if (!Number.isInteger(candidateId)) {
    return NextResponse.json({ error: 'invalid candidate id' }, { status: 400 });
  }
  const body = (await request.json()) as {
    human_verdict?: string | null;
    human_note?: string | null;
  };
  if (
    body.human_verdict !== undefined &&
    body.human_verdict !== null &&
    !['recommend', 'hold', 'reject'].includes(body.human_verdict)
  ) {
    return NextResponse.json(
      { error: 'human_verdict must be recommend|hold|reject|null' },
      { status: 400 }
    );
  }

  migrate();
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM candidates WHERE id = ?`).get(candidateId);
  if (!existing) {
    return NextResponse.json({ error: 'candidate not found' }, { status: 404 });
  }

  db.prepare(
    `UPDATE candidates SET
       human_verdict = CASE WHEN ? THEN ? ELSE human_verdict END,
       human_note = CASE WHEN ? THEN ? ELSE human_note END
     WHERE id = ?`
  ).run(
    body.human_verdict !== undefined ? 1 : 0,
    body.human_verdict ?? null,
    body.human_note !== undefined ? 1 : 0,
    body.human_note ?? null,
    candidateId
  );

  const updated = db.prepare(`SELECT * FROM candidates WHERE id = ?`).get(candidateId);
  return NextResponse.json(updated);
}
