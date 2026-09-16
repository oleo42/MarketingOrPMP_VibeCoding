import Anthropic from '@anthropic-ai/sdk';
import {
  ExtractSchema,
  ScoreSchema,
  type ExtractResult,
  type ScoreResult,
  type Usage,
} from './schemas';

const client = new Anthropic(); // ANTHROPIC_API_KEY from env

const EXTRACT_MODEL = 'claude-sonnet-4-5';
const SCORE_MODEL = 'claude-opus-4-5';

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 500);
    await promise;
    return fn();
  }
}
function extractText(response: Anthropic.Message): string {
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') {
    throw new Error('No text block in Anthropic response');
  }
  return block.text;
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
    const response = await client.messages.create({
      model: EXTRACT_MODEL,
      max_tokens: 2048,
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: text }],
    });
    const data = parseJson(extractText(response), ExtractSchema);
    return {
      data,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  });
}

export async function scoreCandidate(
  jd: string,
  extract: ExtractResult
): Promise<{ data: ScoreResult; usage: Usage }> {
  return callWithRetry(async () => {
    const response = await client.messages.create({
      model: SCORE_MODEL,
      max_tokens: 2048,
      system: SCORE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Job description:\n${jd}\n\nResume extract:\n${JSON.stringify(extract, null, 2)}`,
        },
      ],
    });
    const data = parseJson(extractText(response), ScoreSchema);
    return {
      data,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  });
}
