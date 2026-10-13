import { describe, it, expect } from 'vitest';
import { judgeAnswer, judgeSchema } from './judge';
import { chunkDoc } from './chunker';
import type { RetrievedContext, LlmFn } from './generate';

const ctx = (id: string, text: string): RetrievedContext => ({
  chunk: chunkDoc({ id, title: id, text }, { strategy: 'by-file' })[0],
  score: 0.8,
});

describe('judge (corpus-agnostic)', () => {
  it('accepts valid judge output', () => {
    const valid = { faithfulness: 0.9, relevance: 0.8, reason: 'sticks to context' };
    expect(judgeSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid judge output', () => {
    expect(() => judgeSchema.parse({ faithfulness: 'high', relevance: 1, reason: 5 })).toThrow();
  });

  it('builds prompt with question/answer/contexts', async () => {
    let captured = '';
    const llm: LlmFn<{ faithfulness: number; relevance: number; reason: string }> = async (opts) => {
      captured = opts.user;
      return {
        data: { faithfulness: 1, relevance: 1, reason: 'ok' },
        usage: { input_tokens: 0, output_tokens: 0 },
        raw: '{}',
      };
    };
    await judgeAnswer('q?', 'the answer', [ctx('case1', 'context text')], llm);
    expect(captured).toContain('q?');
    expect(captured).toContain('the answer');
    expect(captured).toContain('context text');
    expect(captured).toContain('case1');
  });
});