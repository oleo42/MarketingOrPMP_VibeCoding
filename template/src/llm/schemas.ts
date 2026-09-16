// ============================================================
// 通用 zod schema 骨架
// 保留模式：zod 定义契约 + z.infer 导出类型 + Usage 统计接口。
// 下面的 ExtractResult/ScoreResult 是最小通用形态：
// 新系统应在自己的 domain 模块里按业务重新定义这两个 schema
// （字段名随业务变，但"抽取结果"与"评分裁决"两个阶段的划分不变）。
// ============================================================
import { z } from 'zod';

/**
 * 第 1 次 LLM 调用（弱模型）：从原始文本抽取结构化字段。
 * 通用约定：raw_summary 保留一段原文摘要，供审核 drawer 展示与回溯。
 */
export const ExtractSchema = z.object({
  /** 条目的展示名（人名/达人昵称/会议标题…），列表页主列 */
  display_name: z.string(),
  /** 业务自定义的结构化字段放这里（技能数组/粉丝画像/行动项…） */
  fields: z.record(z.string(), z.unknown()),
  /** 不超过 500 字的原文摘要 */
  raw_summary: z.string().max(500),
});
export type ExtractResult = z.infer<typeof ExtractSchema>;

/**
 * 第 2 次 LLM 调用（强模型）：结合批次上下文给出可解释裁决。
 * verdict 枚举可按业务改文案（通过/待定/不通过、高/中/低潜…），
 * 但保持三值结构——审核队列 UI 的过滤/徽章/排序都按三档设计。
 */
export const ScoreSchema = z.object({
  verdict: z.enum(['recommend', 'hold', 'reject']),
  score: z.number().min(0).max(100),
  /** 给人看的理由，≤300 字。可解释性是人工审核敢点"确认"的前提。 */
  reason: z.string().max(300),
  /** 风险点列表：AI 把"不确定/要注意"显式列出，而不是藏在分数里 */
  risks: z.array(z.string()),
});
export type ScoreResult = z.infer<typeof ScoreSchema>;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}
