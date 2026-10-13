// ============================================================
// GTM 达人筛选建联 · domain.ts（对照实例，证明"换语料只换此文件"）
// 与 email-security domain.ts 结构完全一致（同 { parse } 接口、同 GenerationConfig），
// 只有 system prompt 的领域语汇 + 输出字段不同。骨架代码零改动。
// 语料：达人名单（Excel 导出 → 结构化文本），而非邮件 case。
// ============================================================

import type { GenerationConfig } from '../rag/generate';

// ---------- 领域输出类型（GTM 语汇） ----------
export interface InfluencerPick {
  pick: string;                    // 建联建议：优先建联 / 备选 / pass
  reason: string;                  // 理由（粉丝画像 + 品类契合）
  risks: string[];                 // 风险点
}

export const InfluencerPickSchema = {
  parse: (v: unknown): InfluencerPick => {
    const o = v as InfluencerPick;
    if (
      typeof o.pick !== 'string' ||
      typeof o.reason !== 'string' ||
      !Array.isArray(o.risks) ||
      o.risks.some((x) => typeof x !== 'string')
    ) {
      throw new Error(`Invalid influencer pick: ${JSON.stringify(v)}`);
    }
    return o;
  },
};

// ---------- 领域 system prompt（GTM 语汇，与 email-security 结构同构、内容不同） ----------
const SYSTEM = `You are a consumer-electronics influencer marketing specialist. Given a campaign brief and a set of shortlisted influencer profiles (from exported platform data), recommend whether to prioritize outreach.

Rules:
- Answer ONLY from the provided profiles. Do NOT invent follower counts or engagement rates.
- Judge fit on: content category match, audience overlap, engagement authenticity, and past brand-safety risk.
- Output ONLY a JSON object (no markdown, no commentary) matching this shape:
{"pick": "prioritize"|"hold"|"pass", "reason": string, "risks": string[]}`;

// ---------- 领域 GenerationConfig ----------
export const influencerConfig: GenerationConfig<InfluencerPick> = {
  system: SYSTEM,
  schema: InfluencerPickSchema,
};