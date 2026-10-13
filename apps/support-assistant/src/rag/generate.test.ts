import { describe, it, expect } from 'vitest';
import { generate, type RetrievedContext, type LlmFn } from './generate';
import { chunkDoc } from './chunker';

const ctx = (id: string, text: string): RetrievedContext => ({
  chunk: chunkDoc({ id, title: id, text }, { strategy: 'by-file' })[0],
  score: 0.8,
});

// mock LLM：回显 system/user，返回固定 data
const echoLlm: LlmFn<{ answer: string }> = async (opts) => {
  return {
    data: { answer: `echo:${opts.system.slice(0, 20)}` },
    usage: { input_tokens: 10, output_tokens: 5 },
    raw: JSON.stringify({ answer: 'echo' }),
  };
};

describe('generate (corpus-agnostic)', () => {
  it('injects question and contexts into user prompt', async () => {
    let captured = '';
    const llm: LlmFn<{ answer: string }> = async (opts) => {
      captured = opts.user;
      return { data: { answer: 'ok' }, usage: { input_tokens: 0, output_tokens: 0 }, raw: '{}' };
    };
    await generate('why quarantined?', [ctx('case1', 'DKIM fail')], { system: 'sys', schema: { parse: (v: unknown) => v as { answer: string } } }, llm);
    expect(captured).toContain('why quarantined?');
    expect(captured).toContain('DKIM fail');
    expect(captured).toContain('case1');
  });

  it('supports function system prompt', async () => {
    let captured = '';
    const llm: LlmFn<{ answer: string }> = async (opts) => {
      captured = opts.system;
      return { data: { answer: 'ok' }, usage: { input_tokens: 0, output_tokens: 0 }, raw: '{}' };
    };
    await generate(
      'q',
      [ctx('case1', 'text')],
      { system: (ctxs) => `expert seen ${ctxs.length} contexts`, schema: { parse: (v: unknown) => v as { answer: string } } },
      llm
    );
    expect(captured).toContain('1 contexts');
  });

  it('handles empty contexts', async () => {
    let captured = '';
    const llm: LlmFn<{ answer: string }> = async (opts) => {
      captured = opts.user;
      return { data: { answer: 'ok' }, usage: { input_tokens: 0, output_tokens: 0 }, raw: '{}' };
    };
    await generate('q', [], { system: 'sys', schema: { parse: (v: unknown) => v as { answer: string } } }, llm);
    expect(captured).toContain('(none)');
  });

  it('returns usage and raw passthrough', async () => {
    const r = await generate('q', [], { system: 'sys', schema: { parse: (v: unknown) => v as { answer: string } } }, echoLlm);
    expect(r.usage.output_tokens).toBe(5);
    expect(r.raw).toContain('echo');
  });
});