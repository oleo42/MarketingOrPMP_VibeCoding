// ============================================================
// LLM provider 抽象（问答 UI · 第 2 段基础设施）
// 设计：LlmProvider 一个 chat() 方法，三个 OpenAI 兼容实现（deepseek/openai/ark）
// 共用同一个 fetch 骨架；Anthropic 留作未来扩展。
// 环境变量 LLM_PROVIDER=deepseek|openai|ark 切换，默认 deepseek。
// 新增 provider：实现 LlmProvider 接口 + 在 getProvider() 加分支。
// ============================================================

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens: number;
  model: string;
}
export interface ChatResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
export interface LlmProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

// ---------- 通用 OpenAI 兼容 fetch 骨架 ----------
// deepseek / openai / ark 三家端点形态完全一致（/chat/completions，Bearer auth，
// usage.prompt_tokens/completion_tokens），共用此函数避免三份重复实现。
async function openAICompatibleChat(
  baseUrl: string,
  apiKey: string,
  req: ChatRequest,
  providerName: string
): Promise<ChatResponse> {
  if (!apiKey) throw new Error(`${providerName} api key missing`);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${providerName} API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: json.choices[0]?.message?.content ?? '',
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

// ---------- DeepSeek ----------
class DeepSeekProvider implements LlmProvider {
  private baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  private apiKey = process.env.DEEPSEEK_API_KEY || '';
  chat(req: ChatRequest): Promise<ChatResponse> {
    return openAICompatibleChat(this.baseUrl, this.apiKey, req, 'DeepSeek');
  }
}

// ---------- OpenAI (ChatGPT) ----------
class OpenAIProvider implements LlmProvider {
  private baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  private apiKey = process.env.OPENAI_API_KEY || '';
  chat(req: ChatRequest): Promise<ChatResponse> {
    return openAICompatibleChat(this.baseUrl, this.apiKey, req, 'OpenAI');
  }
}

// ---------- Volcengine Ark ----------
// 关键：必须用 Coding Plan 端点 /api/coding/v1，/api/v3 会走普通计费。
class ArkProvider implements LlmProvider {
  private baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v1';
  private apiKey = process.env.VOLCENGINE_API_KEYwinomp || process.env.ARK_API_KEY || '';
  chat(req: ChatRequest): Promise<ChatResponse> {
    return openAICompatibleChat(this.baseUrl, this.apiKey, req, 'Ark');
  }
}

export function getProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  if (p === 'openai') return new OpenAIProvider();
  if (p === 'ark') return new ArkProvider();
  return new DeepSeekProvider();
}