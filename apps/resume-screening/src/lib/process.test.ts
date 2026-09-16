import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock llm client and pdf parser before importing the module under test.
vi.mock('../llm/client', () => ({
  extractResume: vi.fn(),
  scoreCandidate: vi.fn(),
}));
vi.mock('./pdf', () => ({
  parsePdf: vi.fn(),
}));

import { extractResume, scoreCandidate } from '../llm/client';
import { parsePdf } from './pdf';
import { getDb, migrate, _resetDbForTest } from '../db';
import { processCandidate } from './process';
import type { Mock } from 'vitest';

const mockExtract = extractResume as Mock;
const mockScore = scoreCandidate as Mock;
const mockParse = parsePdf as Mock;

const validExtract = {
  name: '张三',
  years_experience: 5,
  skills: ['React'],
  highlights: ['架构优化'],
  raw_summary: '高级前端。',
};
const validScore = {
  verdict: 'recommend' as const,
  score: 88,
  reason: '匹配。',
  risks: ['无 GraphQL'],
};

let tmpDir: string;

function seedRunAndCandidate(overrides: { parseStatus?: string } = {}) {
  const db = getDb();
  const runId = (
    db.prepare(`INSERT INTO runs (jd_text, total, status) VALUES (?, 1, 'pending')`).run('JD: 前端工程师')
      .lastInsertRowid as number
  );
  const pdfPath = path.join(tmpDir, 'resume.pdf');
  fs.writeFileSync(pdfPath, 'dummy');
  const candidateId = (
    db
      .prepare(
        `INSERT INTO candidates (run_id, filename, file_path, parse_status) VALUES (?, 'resume.pdf', ?, ?)`
      )
      .run(runId, pdfPath, overrides.parseStatus ?? 'pending').lastInsertRowid as number
  );
  return { runId, candidateId, pdfPath };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-test-'));
  process.env.DB_PATH = path.join(tmpDir, 'test.db');
  _resetDbForTest();
  migrate();
  vi.clearAllMocks();
});

describe('processCandidate', () => {
  it('runs full pipeline and writes extract+score, accumulates tokens, done+1', async () => {
    const { runId, candidateId } = seedRunAndCandidate();
    mockParse.mockResolvedValue({ text: 'x'.repeat(200), needsManual: false });
    mockExtract.mockResolvedValue({ data: validExtract, usage: { input_tokens: 100, output_tokens: 50 } });
    mockScore.mockResolvedValue({ data: validScore, usage: { input_tokens: 200, output_tokens: 80 } });

    await processCandidate(candidateId);

    const db = getDb();
    const cand = db.prepare(`SELECT * FROM candidates WHERE id = ?`).get(candidateId) as Record<string, unknown>;
    expect(cand.parse_status).toBe('scored');
    expect(JSON.parse(cand.extract_json as string)).toEqual(validExtract);
    expect(JSON.parse(cand.score_json as string)).toEqual(validScore);
    expect(cand.ai_verdict).toBe('recommend');
    expect(cand.ai_score).toBe(88);

    const run = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as Record<string, unknown>;
    expect(run.input_tokens).toBe(300);
    expect(run.output_tokens).toBe(130);
    expect(run.done).toBe(1);

    expect(mockExtract).toHaveBeenCalledWith('x'.repeat(200));
    expect(mockScore).toHaveBeenCalledWith('JD: 前端工程师', validExtract);
  });

  it('marks needs_manual for short-text PDFs without calling LLM', async () => {
    const { runId, candidateId } = seedRunAndCandidate();
    mockParse.mockResolvedValue({ text: 'short', needsManual: true });

    await processCandidate(candidateId);

    const db = getDb();
    const cand = db.prepare(`SELECT * FROM candidates WHERE id = ?`).get(candidateId) as Record<string, unknown>;
    expect(cand.parse_status).toBe('needs_manual');
    expect(cand.extract_json).toBeNull();
    expect(mockExtract).not.toHaveBeenCalled();
    expect(mockScore).not.toHaveBeenCalled();

    const run = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as Record<string, unknown>;
    expect(run.done).toBe(1);
    expect(run.input_tokens).toBe(0);
  });

  it('retries once on LLM failure and succeeds on second attempt', async () => {
    const { runId, candidateId } = seedRunAndCandidate();
    mockParse.mockResolvedValue({ text: 'x'.repeat(200), needsManual: false });
    mockExtract
      .mockRejectedValueOnce(new Error('API 500'))
      .mockResolvedValue({ data: validExtract, usage: { input_tokens: 10, output_tokens: 5 } });
    mockScore.mockResolvedValue({ data: validScore, usage: { input_tokens: 20, output_tokens: 10 } });

    await processCandidate(candidateId);

    const db = getDb();
    const cand = db.prepare(`SELECT * FROM candidates WHERE id = ?`).get(candidateId) as Record<string, unknown>;
    expect(cand.parse_status).toBe('scored');
    expect(mockExtract).toHaveBeenCalledTimes(2);

    const run = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as Record<string, unknown>;
    expect(run.input_tokens).toBe(30);
    expect(run.done).toBe(1);
  });

  it('marks failed after retry also fails, still increments done', async () => {
    const { runId, candidateId } = seedRunAndCandidate();
    mockParse.mockRejectedValue(new Error('corrupt pdf'));

    await processCandidate(candidateId);

    const db = getDb();
    const cand = db.prepare(`SELECT * FROM candidates WHERE id = ?`).get(candidateId) as Record<string, unknown>;
    expect(cand.parse_status).toBe('failed');
    expect(mockParse).toHaveBeenCalledTimes(2);

    const run = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as Record<string, unknown>;
    expect(run.done).toBe(1);
    expect(run.input_tokens).toBe(0);
  });

  it('throws only when candidate id does not exist', async () => {
    await expect(processCandidate(9999)).rejects.toThrow('not found');
  });
});
