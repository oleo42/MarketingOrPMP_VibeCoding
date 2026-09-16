import { getDb } from '../db';
import * as realLlm from '../llm/client';
import { parsePdf } from './pdf';
import { logger, errInfo } from './logger';

type Llm = Pick<typeof realLlm, 'extractResume' | 'scoreCandidate'>;
let llm: Llm = realLlm;

/** Swap the LLM implementation (used by scripts/smoke.ts to avoid real API calls). */
export function setLlm(impl: Llm): void {
  llm = impl;
}

interface CandidateRow {
  id: number;
  run_id: number;
  filename: string;
  file_path: string;
  parse_status: string;
}

interface RunRow {
  id: number;
  jd_text: string;
}

/**
 * 闸口4：记录一次状态迁移/处理事件到 candidate_events 表。
 * 每步处理都留痕，异常状态（failed/needs_manual）由此自然显形，详情页直接可读。
 */
function recordEvent(
  candidateId: number,
  runId: number,
  event: string,
  opts: { fromStatus?: string; toStatus?: string; detail?: Record<string, unknown> } = {}
): void {
  getDb()
    .prepare(
      `INSERT INTO candidate_events(candidate_id, run_id, event, from_status, to_status, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      candidateId,
      runId,
      event,
      opts.fromStatus ?? null,
      opts.toStatus ?? null,
      opts.detail ? JSON.stringify(opts.detail) : null
    );
}

const NEEDS_MANUAL_NOTE = {
  verdict: 'needs_manual',
  score: null,
  reason:
    '此 PDF 无文本层（设计软件导出或扫描件），自动解析无法读取内容。请人工查看原文，或重新上传 Word/WPS 导出的带文本层 PDF。',
  risks: [],
};

async function runPipeline(
  candidate: CandidateRow,
  jdText: string
): Promise<{ inputTokens: number; outputTokens: number }> {
  const db = getDb();
  const cid = candidate.id;
  const rid = candidate.run_id;

  recordEvent(cid, rid, 'parse_start');
  const { text, needsManual } = await parsePdf(candidate.file_path);
  recordEvent(cid, rid, 'parse_done', { detail: { text_len: text.length } });

  if (needsManual) {
    db.prepare(
      `UPDATE candidates SET parse_status = 'needs_manual', score_json = ? WHERE id = ?`
    ).run(JSON.stringify(NEEDS_MANUAL_NOTE), cid);
    recordEvent(cid, rid, 'needs_manual', {
      fromStatus: 'pending',
      toStatus: 'needs_manual',
      detail: { text_len: text.length },
    });
    logger.info({ candidate_id: cid, run_id: rid, text_len: text.length }, 'candidate needs_manual (no text layer)');
    return { inputTokens: 0, outputTokens: 0 };
  }

  recordEvent(cid, rid, 'extract_start');
  const extractStart = Date.now();
  const { data: extract, usage: extractUsage, raw: extractRaw } = await llm.extractResume(text);
  recordEvent(cid, rid, 'extract_done', {
    detail: {
      model: 'extract',
      duration_ms: Date.now() - extractStart,
      tokens: extractUsage,
      llm_raw: extractRaw,
    },
  });
  db.prepare(
    `UPDATE candidates SET extract_json = ?, parse_status = 'extracted' WHERE id = ?`
  ).run(JSON.stringify(extract), cid);

  recordEvent(cid, rid, 'score_start');
  const scoreStart = Date.now();
  const { data: score, usage: scoreUsage, raw: scoreRaw } = await llm.scoreCandidate(jdText, extract);
  recordEvent(cid, rid, 'score_done', {
    detail: {
      model: 'score',
      duration_ms: Date.now() - scoreStart,
      tokens: scoreUsage,
      llm_raw: scoreRaw,
    },
  });
  db.prepare(
    `UPDATE candidates SET score_json = ?, ai_verdict = ?, ai_score = ?, parse_status = 'scored' WHERE id = ?`
  ).run(JSON.stringify(score), score.verdict, score.score, cid);

  return {
    inputTokens: extractUsage.input_tokens + scoreUsage.input_tokens,
    outputTokens: extractUsage.output_tokens + scoreUsage.output_tokens,
  };
}

/**
 * Process one candidate: read DB → parse PDF → extract → score → write back.
 * 闸口1：catch 不再静默——失败时记 candidate_events 和进程日志，含错误消息和堆栈。
 * Never throws; always increments run.done and accumulates token usage.
 */
export async function processCandidate(candidateId: number): Promise<void> {
  const db = getDb();
  const candidate = db
    .prepare(`SELECT * FROM candidates WHERE id = ?`)
    .get(candidateId) as CandidateRow | undefined;
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }
  const run = db
    .prepare(`SELECT * FROM runs WHERE id = ?`)
    .get(candidate.run_id) as RunRow | undefined;
  if (!run) {
    throw new Error(`Run ${candidate.run_id} not found for candidate ${candidateId}`);
  }

  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const usage = await runPipeline(candidate, run.jd_text);
    inputTokens = usage.inputTokens;
    outputTokens = usage.outputTokens;
  } catch (firstErr) {
    // 第一次失败：记录并重试一次
    logger.warn(
      { candidate_id: candidateId, run_id: candidate.run_id, err: errInfo(firstErr), attempt: 1 },
      'pipeline failed, retrying once'
    );
    try {
      const usage = await runPipeline(candidate, run.jd_text);
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
    } catch (secondErr) {
      // 第二次失败：闸口1 收口，绝不静默——记 DB 事件 + 进程日志
      const info = errInfo(secondErr);
      db.prepare(`UPDATE candidates SET parse_status = 'failed' WHERE id = ?`).run(candidateId);
      recordEvent(candidateId, candidate.run_id, 'failed', {
        fromStatus: candidate.parse_status,
        toStatus: 'failed',
        detail: { error: info.message, stack: info.stack, retried: true },
      });
      logger.error(
        { candidate_id: candidateId, run_id: candidate.run_id, err: info, retried: true },
        'pipeline failed after retry, marked failed'
      );
    }
  }

  db.prepare(
    `UPDATE runs SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, done = done + 1 WHERE id = ?`
  ).run(inputTokens, outputTokens, candidate.run_id);
}
