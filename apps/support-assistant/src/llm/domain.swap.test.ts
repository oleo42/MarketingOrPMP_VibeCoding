import { describe, it, expect } from 'vitest';
import { generate, type LlmFn, type RetrievedContext } from '../rag/generate';
import { chunkDoc } from '../rag/chunker';
import { emailSecurityConfig, type Answer } from './domain';
import { influencerConfig, type InfluencerPick } from './domain.gtm';

const ctx = (id: string, text: string): RetrievedContext => ({
  chunk: chunkDoc({ id, title: id, text }, { strategy: 'by-file' })[0],
  score: 0.8,
});

function echoLlm<T>(schema: { parse: (v: unknown) => T }): LlmFn<T> {
  return async (opts) => ({
    data: schema.parse(JSON.parse('{}')),
    usage: { input_tokens: 0, output_tokens: 0 },
    raw: '{}',
  });
}

describe('swap domain.ts — same skeleton, no code change', () => {
  it('email-security config drives generate with email vocab', async () => {
    let captured = '';
    const llm: LlmFn<Answer> = async (opts) => {
      captured = opts.system;
      return {
        data: { answer: 'ok', cited_case_ids: ['c1'], confidence: 0.9 },
        usage: { input_tokens: 0, output_tokens: 0 },
        raw: '{}',
      };
    };
    await generate<Answer>(
      'why quarantined?',
      [ctx('c1', 'DKIM fail')],
      emailSecurityConfig,
      llm
    );
    expect(captured).toContain('Microsoft 365 email security');
  });

  it('GTM config drives the SAME generate with GTM vocab', async () => {
    let captured = '';
    const llm: LlmFn<InfluencerPick> = async (opts) => {
      captured = opts.system;
      return {
        data: { pick: 'prioritize', reason: 'fit', risks: [] },
        usage: { input_tokens: 0, output_tokens: 0 },
        raw: '{}',
      };
    };
    await generate<InfluencerPick>(
      'should we reach out to this influencer?',
      [ctx('inf1', '3C creator 50k followers')],
      influencerConfig,
      llm
    );
    expect(captured).toContain('influencer marketing');
    expect(captured).not.toContain('email security');
  });

  it('both configs share the {system, schema} shape (structural contract)', () => {
    expect(emailSecurityConfig.schema).toBeDefined();
    expect(influencerConfig.schema).toBeDefined();
  });
});