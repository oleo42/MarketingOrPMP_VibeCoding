import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, migrate, _resetDbForTest } from './index';

describe('db', () => {
  beforeEach(() => {
    _resetDbForTest();
    process.env.DB_PATH = ':memory:';
  });

  it('creates tables', () => {
    migrate();
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain('runs');
    expect(tables.map((t) => t.name)).toContain('candidates');
  });

  it('migrate is idempotent', () => {
    migrate();
    migrate();
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain('runs');
  });

  it('runs and candidates have expected columns and defaults', () => {
    migrate();
    const d = getDb();
    d.prepare("INSERT INTO runs (jd_text) VALUES ('JD text')").run();
    const run = d.prepare('SELECT * FROM runs WHERE id = 1').get() as Record<string, unknown>;
    expect(run.status).toBe('pending');
    expect(run.total).toBe(0);
    expect(run.done).toBe(0);
    expect(run.input_tokens).toBe(0);
    expect(run.output_tokens).toBe(0);
    expect(run.finished_at).toBeNull();

    d.prepare(
      "INSERT INTO candidates (run_id, filename, file_path) VALUES (1, 'a.pdf', '/tmp/a.pdf')"
    ).run();
    const cand = d.prepare('SELECT * FROM candidates WHERE id = 1').get() as Record<string, unknown>;
    expect(cand.parse_status).toBe('pending');
    expect(cand.extract_json).toBeNull();
    expect(cand.ai_verdict).toBeNull();
  });
});
