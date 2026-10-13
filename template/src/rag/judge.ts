// ============================================================
// RAG core · judge（语料无关骨架）
// 职责：对生成答案做 faithfulness（忠于上下文，不编造）/ relevance（切题）两维评判。
// 两维 rubric 是通用度量，不感知领域语汇，完全内置；领域只影响被评的 query/answer 内容。
// 依赖注入 llm 函数（mock 可测 / 生产接 runLlmTask）。
// ============================================================

import type { RetrievedContext, LlmFn, Usage } from './generate';

export interface JudgeResult {
  faithfulness: number; // 0-1：答案是否只来自上下文、不编造
  relevance: number;    // 0-1：答案是否切中 query
  reason: string;       // 判分依据
}

const JUDGE_SYSTEM = `You are an evaluation judge for a RAG system. Given a question, the retrieved reference contexts, and a generated answer, output ONLY a JSON object (no markdown, no commentary) matching this shape:
{"faithfulness": number 0-1 (how well the answer sticks to the reference contexts and does not fabricate), "relevance": number 0-1 (how directly the answer addresses the question), "reason": string (<=200 chars explaining the scores)}`;

function buildJudgePrompt(query: string, answer: string, contexts: RetrievedContext[]): string {
  const ctx = contexts
    .map((c, i) => `[${i}] (source: ${c.chunk.docId})\n${c.chunk.text}`)
    .join('\n\n');
  return (
    `Question:\n${query}\n\n` +
    `Reference contexts:\n${ctx || '(none)'}\n\n` +
    `Generated answer:\n${answer}`
  );
}

// JudgeResult 的 zod schema 由调用方传入（或在此提供默认）。这里用结构校验接口，避免 import zod 类型。
export const judgeSchema = {
  parse: (v: unknown): JudgeResult => {
    const o = v as { faithfulness: number; relevance: number; reason: string };
    if (
      typeof o.faithfulness !== 'number' ||
      typeof o.relevance !== 'number' ||
      typeof o.reason !== 'string'
    ) {
      throw new Error(`Invalid judge output: ${JSON.stringify(v)}`);
    }
    return o;
  },
};

export async function judgeAnswer(
  query: string,
  answer: string,
  contexts: RetrievedContext[],
  llm: LlmFn<JudgeResult>
): Promise<{ data: JudgeResult; usage: Usage; raw: string }> {
  return llm({
    system: JUDGE_SYSTEM,
    user: buildJudgePrompt(query, answer, contexts),
    schema: judgeSchema,
  });
}