import {
  ExtractSchema,
  ScoreSchema,
  type ExtractResult,
  type ScoreResult,
  type Usage,
} from './schemas';
import { getProvider } from './providers';

// 模型常量按 provider 区分；ark 用 Coding Plan 支持的模型
const PROVIDER = (process.env.LLM_PROVIDER || 'ark').toLowerCase();
const EXTRACT_MODEL =
  process.env.EXTRACT_MODEL || (PROVIDER === 'anthropic' ? 'claude-sonnet-4-5' : 'ark-code-latest');
const SCORE_MODEL =
  process.env.SCORE_MODEL || (PROVIDER === 'anthropic' ? 'claude-opus-4-5' : 'ark-code-latest');

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    await new Promise((r) => setTimeout(r, 500));
    return fn();
  }
}

function parseJson<T>(raw: string, schema: { parse: (v: unknown) => T }): T {
  // Strip markdown code fences if present, then parse the first JSON object.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`No JSON object found in response: ${raw.slice(0, 200)}`);
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return schema.parse(parsed);
}

const EXTRACT_SYSTEM = `You are a resume parser. Extract structured fields from the resume text and output ONLY a JSON object (no markdown, no commentary) matching this shape:
{"name": string, "years_experience": number, "skills": string[], "highlights": string[], "raw_summary": string (<=200 chars)}`;

const SCORE_SYSTEM = `You are a recruiter. Given a job description and a structured resume extract, output ONLY a JSON object (no markdown, no commentary) matching this shape:
{"verdict": "recommend"|"hold"|"reject", "score": number 0-100, "reason": string (<=300 chars), "risks": string[]}`;

export async function extractResume(
  text: string
): Promise<{ data: ExtractResult; usage: Usage }> {
  return callWithRetry(async () => {
    const res = await getProvider().chat({
      model: EXTRACT_MODEL,
      maxTokens: 2048,
      system: EXTRACT_SYSTEM,
      user: text,
    });
    const data = parseJson(res.text, ExtractSchema);
    return { data, usage: { input_tokens: res.inputTokens, output_tokens: res.outputTokens } };
  });
}

export async function scoreCandidate(
  jd: string,
  extract: ExtractResult
): Promise<{ data: ScoreResult; usage: Usage }> {
  return callWithRetry(async () => {
    const res = await getProvider().chat({
      model: SCORE_MODEL,
      maxTokens: 2048,
      system: SCORE_SYSTEM,
      user: `Job description:\n${jd}\n\nResume extract:\n${JSON.stringify(extract, null, 2)}`,
    });
    const data = parseJson(res.text, ScoreSchema);
    return { data, usage: { input_tokens: res.inputTokens, output_tokens: res.outputTokens } };
  });
}
