#!/usr/bin/env tsx
// judge-calibration: 把 judge-calibrate.ts 的并发改成受控串行/小批，
// 用真实 Ark 跑 20 条校准，诊断并规避 401。
// 用法: tsx scripts/judge-calibrate-serial.ts
import { judgeCalibrationSet } from '../src/rag/judge-calibration';
import { judgeAnswer, type JudgeResult } from '../src/rag/judge';
import type { LlmFn, RetrievedContext } from '../src/rag/generate';

function toContexts(texts: string[]): RetrievedContext[] {
  return texts.map((text, i) => ({
    chunk: { docId: `ctx-${i}`, text },
    score: 0.8,
  }));
}

async function loadRealLlm(): Promise<LlmFn<JudgeResult>> {
  const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v1';
  const apiKey = process.env.VOLCENGINE_API_KEYwinomp || process.env.ARK_API_KEY || '';
  if (!apiKey) throw new Error('ARK api key missing');
  const model = process.env.SCORE_MODEL || 'ark-code-latest';

  return async (opts) => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ark API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    const text = json.choices[0]?.message?.content ?? '';
    return {
      data: opts.schema.parse(parseJson(text)),
      usage: { input_tokens: json.usage?.prompt_tokens ?? 0, output_tokens: json.usage?.completion_tokens ?? 0 },
      raw: text,
    };
  };
}

function parseJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`No JSON object found in response: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function main() {
  const llm = await loadRealLlm();
  const results: Array<{ id: string; faithfulLabel: boolean; faithfulness: number; relevance: number }> = [];
  let failures = 0;

  // 串行跑，逐条报告进度 + 捕获单条失败
  for (const item of judgeCalibrationSet) {
    try {
      const { data } = await judgeAnswer(item.query, item.answer, toContexts(item.contexts), llm);
      results.push({ id: item.id, faithfulLabel: item.faithful, faithfulness: data.faithfulness, relevance: data.relevance });
      console.log(`${item.id}  label=${item.faithful ? 'faithful' : 'fabricated'}  faithfulness=${data.faithfulness.toFixed(2)}`);
    } catch (e) {
      failures++;
      console.log(`${item.id}  FAILED: ${(e as Error).message.slice(0, 120)}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const faithful = results.filter((r) => r.faithfulLabel);
  const fabricated = results.filter((r) => !r.faithfulLabel);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const faithfulMean = mean(faithful.map((r) => r.faithfulness));
  const fabricatedMean = mean(fabricated.map((r) => r.faithfulness));
  const gap = faithfulMean - fabricatedMean;
  const correct = results.filter((r) => (r.faithfulness > 0.5) === r.faithfulLabel).length;
  const accuracy = correct / results.length;

  console.log(`\n=== judge calibration (real, serial) ===`);
  console.log(`succeeded: ${results.length}/${judgeCalibrationSet.length} (failures: ${failures})`);
  console.log(`faithful mean:  ${faithfulMean.toFixed(3)}`);
  console.log(`fabricated mean: ${fabricatedMean.toFixed(3)}`);
  console.log(`gap: ${gap.toFixed(3)} (accept if ≥ 0.5)`);
  console.log(`accuracy @0.5: ${(accuracy * 100).toFixed(1)}%`);
  console.log(`${gap >= 0.5 ? 'PASS' : 'FAIL'}: judge distinguishes faithful vs fabricated`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});