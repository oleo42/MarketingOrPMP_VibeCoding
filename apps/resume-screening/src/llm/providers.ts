// LLM provider 抽象：Anthropic 与 Volcengine Ark（OpenAI 兼容）双实现
// 环境变量 LLM_PROVIDER=anthropic|ark 切换，默认 ark（本机已配 VOLCENGINE key）
import Anthropic from '@anthropic-ai/sdk';

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

// ---------- Anthropic ----------
class AnthropicProvider implements LlmProvider {
  private client = new Anthropic(); // ANTHROPIC_API_KEY
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('No text block in Anthropic response');
    return {
      text: block.text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }
}

// ---------- Volcengine Ark (OpenAI-compatible) ----------
// 关键：必须用 Coding Plan 端点 /api/coding/v1，/api/v3 会走普通计费
class ArkProvider implements LlmProvider {
  private baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v1';
  private apiKey = process.env.VOLCENGINE_API_KEYwinomp || process.env.ARK_API_KEY || '';
  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.apiKey) throw new Error('ARK api key missing: set VOLCENGINE_API_KEYwinomp or ARK_API_KEY');
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error(`Ark API ${res.status}: ${body.slice(0, 300)}`);
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
}

export function getProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER || 'ark').toLowerCase();
  return p === 'anthropic' ? new AnthropicProvider() : new ArkProvider();
}
