// 问答共享逻辑：/api/ask（检索）与 /api/answer（生成）共用语料加载、LLM 调用、检索暂存。
// 从 route.ts 抽出来——App Router 的 route.ts 只允许导出 HTTP 动词，共享代码须放独立模块。
import { readFileSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { chunkDoc, type Chunk } from '@/rag/chunker';
import type { RetrievedContext } from '@/rag/generate';
import { getProvider } from '@/llm/providers';
import type { Answer } from '@/llm/domain';

// ---------- 语料加载（模块级缓存，进程内只读一次） ----------
// 邮件安全 case 语料静态、量小（107 个），启动时读进内存，避免每次请求都 IO。
let cachedChunks: Chunk[] | null = null;
export function loadChunks(): Chunk[] {
  if (cachedChunks) return cachedChunks;
  const corpusPath = path.resolve(
    process.cwd(),
    process.env.CORPUS_PATH || 'data/corpus.jsonl'
  );
  const docs = readFileSync(corpusPath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { id: string; title: string; text: string });
  cachedChunks = docs.flatMap((d) => chunkDoc(d, { strategy: 'by-file' }));
  return cachedChunks;
}

// ---------- 检索结果暂存（queryId → contexts） ----------
// /api/ask 立即返回检索结果；/api/answer 用 queryId 取回 contexts 再生成，避免重复检索。
// 挂 globalThis：Next.js dev 模式每个 route 独立模块实例，模块级 Map 不共享；
// globalThis 保证同进程内跨 route 可见。容量有界（LRU 简化），重启即失效——会话级缓存。
const g = globalThis as unknown as { __retrievalCache?: Map<string, RetrievedContext[]> };
if (!g.__retrievalCache) g.__retrievalCache = new Map();
export const retrievalCache = g.__retrievalCache;

export function cacheKey(query: string, topK: number): string {
  return createHash('sha1').update(`${query}::${topK}`).digest('hex').slice(0, 16);
}

// ---------- 领域 LLM 函数（接 providers.ts，可切 deepseek/openai/ark） ----------
// 输出契约 {answer, cited_case_ids, confidence} 来自 src/llm/domain.ts。
export async function llmFn(opts: {
  system: string;
  user: string;
  schema: { parse: (v: unknown) => Answer };
}) {
  const provider = getProvider();
  // 模型名必须跟 provider 匹配：各家端点只认自家模型。
  // GENERATE_MODEL 可覆盖；否则按 LLM_PROVIDER 给默认（ark 用 ark-code-latest）。
  const providerName = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  const defaultModel =
    providerName === 'ark'
      ? 'ark-code-latest'
      : providerName === 'openai'
        ? 'gpt-4o-mini'
        : 'deepseek-chat';
  const model = process.env.GENERATE_MODEL || defaultModel;
  const res = await provider.chat({
    system: opts.system,
    user: opts.user,
    // ark-code-latest 是 reasoning 模型：reasoning_tokens 与 content 共享 max_tokens 预算，
    // 2048 会让 content JSON 截断（实测 reasoning 占 ~1100/1432）。调大容纳完整输出。
    maxTokens: 6000,
    model,
  });
  // 鲁棒 JSON 解析：剥 fence → 截取 {} → schema.parse（沿用模板 client.ts 的策略）
  const cleaned = res.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`No JSON object in LLM response: ${res.text.slice(0, 200)}`);
  }
  const data = opts.schema.parse(JSON.parse(cleaned.slice(start, end + 1)));
  return {
    data,
    usage: { input_tokens: res.inputTokens, output_tokens: res.outputTokens },
    raw: res.text,
  };
}
