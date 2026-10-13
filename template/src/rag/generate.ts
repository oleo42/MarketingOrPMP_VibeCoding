// ============================================================
// RAG core · generate（语料无关骨架）
// 职责：拼检索上下文 → 调 LLM 生成答案。领域语汇（角色/prompt/schema）由
// RagDomainConfig.generation 提供，本层只负责通用的上下文拼接与调用。
// 依赖注入 llm 函数（可 mock 测试、生产接线 runLlmTask），使本层不 import 具体 provider。
// ============================================================

import type { Chunk } from './chunker';

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

// 泛化的 LLM 调用函数：生产接 template 的 runLlmTask，测试接 mock
export interface LlmFn<T> {
  (opts: { system: string; user: string; schema: { parse: (v: unknown) => T } }): Promise<{
    data: T;
    usage: Usage;
    raw: string;
  }>;
}

export interface RetrievedContext {
  chunk: Chunk;
  score: number;
}

export interface GenerationConfig<T = unknown> {
  // 领域 system prompt：字符串或函数（函数可拿到上下文列表，拼领域语汇）
  system: string | ((contexts: string[]) => string);
  // 输出契约 zod schema
  schema: { parse: (v: unknown) => T };
}

// 语料无关的通用 user prompt 拼接：query + 带来源 id 的上下文
function buildUserPrompt(query: string, contexts: RetrievedContext[]): string {
  const ctx = contexts
    .map((c, i) => `[${i}] (source: ${c.chunk.docId})\n${c.chunk.text}`)
    .join('\n\n');
  return (
    `Question: ${query}\n\n` +
    `Reference contexts:\n${ctx || '(none)'}\n\n` +
    `Answer using ONLY the reference contexts above. If the answer is not in the contexts, say so explicitly. Cite source ids in brackets.`
  );
}

export async function generate<T>(
  query: string,
  contexts: RetrievedContext[],
  config: GenerationConfig<T>,
  llm: LlmFn<T>
): Promise<{ data: T; usage: Usage; raw: string }> {
  const system =
    typeof config.system === 'function'
      ? config.system(contexts.map((c) => c.chunk.text))
      : config.system;
  return llm({ system, user: buildUserPrompt(query, contexts), schema: config.schema });
}