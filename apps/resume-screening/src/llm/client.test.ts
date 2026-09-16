import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { ExtractResult } from './schemas';

// Shared mock for the Anthropic messages.create call. vi.mock is hoisted,
// so grab the fn via the mocked module after import.
import Anthropic from '@anthropic-ai/sdk';
import { extractResume, scoreCandidate } from './client';

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  class MockAnthropic {
    messages = { create };
  }
  return { default: MockAnthropic, __mockCreate: create };
});

function mockCreate(): Mock {
  return (new Anthropic() as unknown as { messages: { create: Mock } }).messages.create;
}

function makeResponse(text: string, inputTokens = 10, outputTokens = 20) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const validExtract = {
  name: 'Alice',
  years_experience: 5,
  skills: ['React', 'TypeScript'],
  highlights: ['Led frontend team'],
  raw_summary: 'Senior frontend engineer.',
};

const validScore = {
  verdict: 'recommend',
  score: 85,
  reason: 'Strong match.',
  risks: ['No GraphQL experience'],
};

beforeEach(() => {
  mockCreate().mockReset();
});

describe('extractResume', () => {
  it('returns parsed data and usage on success', async () => {
    mockCreate().mockResolvedValueOnce(makeResponse(JSON.stringify(validExtract), 100, 50));

    const result = await extractResume('resume text');

    expect(result.data).toEqual(validExtract);
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
    expect(mockCreate()).toHaveBeenCalledTimes(1);
    const callArg = mockCreate().mock.calls[0][0] as { model: string };
    expect(callArg.model).toBe('claude-sonnet-4-5');
  });

  it('strips markdown fences and JSON-decodes', async () => {
    mockCreate().mockResolvedValueOnce(makeResponse('```json\n' + JSON.stringify(validExtract) + '\n```'));

    const result = await extractResume('resume text');
    expect(result.data).toEqual(validExtract);
  });

  it('retries once on failure then succeeds', async () => {
    mockCreate()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeResponse(JSON.stringify(validExtract)));

    const result = await extractResume('resume text');
    expect(result.data).toEqual(validExtract);
    expect(mockCreate()).toHaveBeenCalledTimes(2);
  });

  it('throws after two consecutive failures', async () => {
    mockCreate().mockRejectedValue(new Error('persistent'));

    await expect(extractResume('resume text')).rejects.toThrow('persistent');
    expect(mockCreate()).toHaveBeenCalledTimes(2);
  });

  it('throws after retry when zod validation fails twice', async () => {
    const badResponse = makeResponse(JSON.stringify({ name: 'Alice' })); // missing fields
    mockCreate().mockResolvedValue(badResponse);

    await expect(extractResume('resume text')).rejects.toThrow();
    expect(mockCreate()).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed JSON', async () => {
    mockCreate().mockResolvedValue(makeResponse('not json at all'));

    await expect(extractResume('resume text')).rejects.toThrow();
  });
});

describe('scoreCandidate', () => {
  it('returns parsed data and usage on success', async () => {
    mockCreate().mockResolvedValueOnce(makeResponse(JSON.stringify(validScore), 200, 80));

    const result = await scoreCandidate('JD text', validExtract as ExtractResult);

    expect(result.data).toEqual(validScore);
    expect(result.usage).toEqual({ input_tokens: 200, output_tokens: 80 });
    const callArg = mockCreate().mock.calls[0][0] as { model: string };
    expect(callArg.model).toBe('claude-opus-4-5');
  });

  it('rejects out-of-range score via zod', async () => {
    mockCreate().mockResolvedValue(makeResponse(JSON.stringify({ ...validScore, score: 150 })));

    await expect(scoreCandidate('JD', validExtract as ExtractResult)).rejects.toThrow();
    expect(mockCreate()).toHaveBeenCalledTimes(2); // retried once
  });

  it('rejects invalid verdict enum', async () => {
    mockCreate().mockResolvedValue(makeResponse(JSON.stringify({ ...validScore, verdict: 'maybe' })));

    await expect(scoreCandidate('JD', validExtract as ExtractResult)).rejects.toThrow();
  });

  it('includes JD and extract in user message', async () => {
    mockCreate().mockResolvedValueOnce(makeResponse(JSON.stringify(validScore)));

    await scoreCandidate('Frontend JD', validExtract as ExtractResult);

    const callArg = mockCreate().mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    const userMsg = callArg.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Frontend JD');
    expect(userMsg?.content).toContain('Alice');
  });
});
