import { getDb } from '../db';
import * as realLlm from '../llm/client';
import { parsePdf } from './pdf';

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

async function runPipeline(
  candidate: CandidateRow,
  jdText: string
): Promise<{ inputTokens: number; outputTokens: number }> {
  const db = getDb();
  const { text, needsManual } = await parsePdf(candidate.file_path);

  if (needsManual) {
    // 无文本层 PDF（设计版/扫描版）：不调 LLM，但留一条人话解释，
    // 让详情页有内容可显示，而不是 extract/score 全 null 的空白。
    const note = {
      verdict: 'needs_manual',
      score: null,
      reason:
        '此 PDF 无文本层（设计软件导出或扫描件），自动解析无法读取内容。请人工查看原文，或重新上传 Word/WPS 导出的带文本层 PDF。',
      risks: [],
    };
    db.prepare(
      `UPDATE candidates SET parse_status = 'needs_manual', score_json = ? WHERE id = ?`
    ).run(JSON.stringify(note), candidate.id);
    return { inputTokens: 0, outputTokens: 0 };
  }

  const { data: extract, usage: extractUsage } = await llm.extractResume(text);
  db.prepare(
    `UPDATE candidates SET extract_json = ?, parse_status = 'extracted' WHERE id = ?`
  ).run(JSON.stringify(extract), candidate.id);

  const { data: score, usage: scoreUsage } = await llm.scoreCandidate(jdText, extract);
  db.prepare(
    `UPDATE candidates SET score_json = ?, ai_verdict = ?, ai_score = ?, parse_status = 'scored' WHERE id = ?`
  ).run(JSON.stringify(score), score.verdict, score.score, candidate.id);

  return {
    inputTokens: extractUsage.input_tokens + scoreUsage.input_tokens,
    outputTokens: extractUsage.output_tokens + scoreUsage.output_tokens,
  };
}

/**
 * Process one candidate: read DB → parse PDF → extract → score → write back.
 * Failures: retry the whole pipeline once, then mark parse_status='failed'.
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
  } catch {
    try {
      const usage = await runPipeline(candidate, run.jd_text);
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
    } catch {
      db.prepare(`UPDATE candidates SET parse_status = 'failed' WHERE id = ?`).run(
        candidateId
      );
    }
  }

  db.prepare(
    `UPDATE runs SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, done = done + 1 WHERE id = ?`
  ).run(inputTokens, outputTokens, candidate.run_id);
}
