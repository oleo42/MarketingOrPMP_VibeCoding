// ============================================================
// 通用 LLM 调用骨架（四段式 · 第 2 段的引擎）
// 保留 resume-screening 验证过的五个机制：
//   1. 模型分层（EXTRACT 弱模型 / SCORE 强模型，env 可覆盖）
//   2. 失败重试一次（网络抖动/限流的第一道防线）
//   3. 鲁棒 JSON 解析（剥 markdown fence → 截取首个 {} → zod 校验）
//   4. token 用量随结果返回（批次级成本统计的数据来源）
//   5. raw 原始响应透传（闸口3）：zod 失败/截断/verdict 异常时，
//      由 process.ts 落 item_events.detail.llm_raw 供溯源
// 泛化点：领域 prompt 与 zod schema 全部抽出为参数，
// 新系统在自己的 llm/domain.ts 里定义 prompt + schema，调用 runLlmTask 即可。
// ============================================================
import { getProvider } from './providers';
import type { Usage } from './schemas';

// 模型分层原则：结构化抽取是"苦力活"，弱模型够用且快；
// 打分/理由/风险判断是"专家活"，直接决定人工审核的信任度，用强模型。
const PROVIDER = (process.env.LLM_PROVIDER || 'ark').toLowerCase();
const EXTRACT_MODEL =
  process.env.EXTRACT_MODEL || (PROVIDER === 'anthropic' ? 'claude-sonnet-4-5' : 'ark-code-latest');
const SCORE_MODEL =
  process.env.SCORE_MODEL || (PROVIDER === 'anthropic' ? 'claude-opus-4-5' : 'ark-code-latest');

/** 重试一次：LLM API 的瞬时失败率高到值得重试，但超过一次多半是 prompt/数据本身的问题。 */
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    await new Promise((r) => setTimeout(r, 500));
    return fn();
  }
}

/**
 * 鲁棒 JSON 解析：LLM 说了"只输出 JSON"也常带 markdown fence 或前后缀。
 * 策略：剥 fence → 截取第一个 { 到最后一个 } → JSON.parse → zod 校验。
 * zod 校验是契约底线：模型少字段/类型错时在这里抛错，而不是脏数据进库。
 */
export function parseJson<T>(raw: string, schema: { parse: (v: unknown) => T }): T {
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

export interface LlmTask<T> {
  /** 分层：'extract' 走弱模型，'score' 走强模型 */
  tier: 'extract' | 'score';
  /** 领域 system prompt（这是新系统唯一必须手写的东西） */
  system: string;
  /** 用户输入：解析出的文本 / 上一阶段的 JSON 拼进来 */
  user: string;
  /** 输出契约：zod schema */
  schema: { parse: (v: unknown) => T };
  maxTokens?: number;
}

/**
 * 一次"调用 LLM 拿结构化结果"的完整流程。
 * 返回 raw（原始响应文本）：闸口3——解析失败/输出异常时，调用方应把 raw 落库
 * （process.ts 已示范：写入 item_events 的 detail.llm_raw），不让模型输出蒸发。
 * 用法示例见本目录 domain.example.ts。
 */
export async function runLlmTask<T>(
  task: LlmTask<T>
): Promise<{ data: T; usage: Usage; raw: string }> {
  return callWithRetry(async () => {
    const res = await getProvider().chat({
      model: task.tier === 'extract' ? EXTRACT_MODEL : SCORE_MODEL,
      maxTokens: task.maxTokens ?? 2048,
      system: task.system,
      user: task.user,
    });
    const data = parseJson(res.text, task.schema);
    return {
      data,
      usage: { input_tokens: res.inputTokens, output_tokens: res.outputTokens },
      raw: res.text,
    };
  });
}
