// ============================================================
// 邮件安全排障助手 · domain.ts（唯一手写层）
// 这就是"换语料只换这个文件"的实物证明。GTM 实例 = 换一套 system prompt + schema。
// 本文件只含领域语汇：角色定位 + 输出契约。骨架（chunk/retrieve/generate/judge）零改动。
// 依赖：零外部依赖。schema 用结构接口（与 generate.ts 的 GenerationConfig 一致），
//       接线时可用 zod（模板约定）替换，但保持 { parse } 形状不变即可。
// ============================================================

import type { GenerationConfig } from '../rag/generate';

// ---------- 领域输出类型 ----------
export interface Answer {
  answer: string;                       // 排障结论 + 步骤
  cited_case_ids: string[];             // 引用的 case id（必须来自检索上下文）
  confidence: number;                   // 0-1 置信度
}

// 结构校验（与 generate.ts 的 { parse } 接口一致，零依赖）
export const AnswerSchema = {
  parse: (v: unknown): Answer => {
    const o = v as Answer;
    if (
      typeof o.answer !== 'string' ||
      !Array.isArray(o.cited_case_ids) ||
      o.cited_case_ids.some((x) => typeof x !== 'string') ||
      typeof o.confidence !== 'number'
    ) {
      throw new Error(`Invalid answer output: ${JSON.stringify(v)}`);
    }
    return o;
  },
};

// ---------- 领域 system prompt（唯一含领域语汇的地方） ----------
const SYSTEM = `You are a Microsoft 365 email security support engineer. Given a customer question and a set of reference support cases (symptom → cause → resolution), answer the customer's troubleshooting question.

Rules:
- Answer ONLY from the reference cases. If the answer is not in the cases, say so explicitly and do NOT fabricate PowerShell commands or Microsoft documentation.
- Cite case ids in [brackets] for every claim drawn from a case.
- Be concrete: name the exact symptom, root cause, and resolution steps from the matched case.
- If multiple cases are relevant, synthesize; note where they agree or diverge.
- Output ONLY a JSON object (no markdown, no commentary) matching this shape:
{"answer": string, "cited_case_ids": string[], "confidence": number 0-1}`;

// ---------- 领域 GenerationConfig ----------
export const emailSecurityConfig: GenerationConfig<Answer> = {
  system: SYSTEM,
  schema: AnswerSchema,
};