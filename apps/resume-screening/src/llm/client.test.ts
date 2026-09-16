import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { extractResume, scoreCandidate } from './client';
import { getProvider } from './providers';
import type { ChatResponse } from './providers';

vi.mock('./providers', () => {
  const chat = vi.fn();
  return { getProvider: () => ({ chat }), __mockChat: chat };
});

function mockChat(): Mock {
  return (getProvider() as unknown as { chat: Mock }).chat;
}

function makeChat(text: string, inputTokens = 10, outputTokens = 20): ChatResponse {
  return { text, inputTokens, outputTokens };
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
  mockChat().mockReset();
});

describe('extractResume', () => {
  it('returns parsed data and usage on success', async () => {
    mockChat().mockResolvedValueOnce(makeChat(JSON.stringify(validExtract), 11, 22));
    const { data, usage } = await extractResume('resume text');
    expect(data).toEqual(validExtract);
    expect(usage).toEqual({ input_tokens: 11, output_tokens: 22 });
  });

  it('strips markdown code fences before parsing', async () => {
    mockChat().mockResolvedValueOnce(makeChat('```json\n' + JSON.stringify(validExtract) + '\n```'));
    const { data } = await extractResume('resume text');
    expect(data).toEqual(validExtract);
  });

  it('retries once on network error then succeeds', async () => {
    mockChat()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeChat(JSON.stringify(validExtract)));
    const { data } = await extractResume('resume text');
    expect(data).toEqual(validExtract);
    expect(mockChat()).toHaveBeenCalledTimes(2);
  });

  it('throws after two consecutive failures', async () => {
    mockChat().mockRejectedValue(new Error('network'));
    await expect(extractResume('resume text')).rejects.toThrow('network');
    expect(mockChat()).toHaveBeenCalledTimes(2);
  });

  it('retries once on zod validation failure then throws', async () => {
    const bad = { ...validExtract, years_experience: 'five' };
    mockChat().mockResolvedValue(makeChat(JSON.stringify(bad)));
    await expect(extractResume('resume text')).rejects.toThrow();
    expect(mockChat()).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed JSON with no object', async () => {
    mockChat().mockResolvedValue(makeChat('not json at all'));
    await expect(extractResume('resume text')).rejects.toThrow('No JSON object');
  });
});

describe('scoreCandidate', () => {
  const extract = validExtract;

  it('returns parsed score and usage on success', async () => {
    mockChat().mockResolvedValueOnce(makeChat(JSON.stringify(validScore), 33, 44));
    const { data, usage } = await scoreCandidate('jd text', extract);
    expect(data).toEqual(validScore);
    expect(usage).toEqual({ input_tokens: 33, output_tokens: 44 });
  });

  it('rejects score out of range', async () => {
    mockChat().mockResolvedValue(makeChat(JSON.stringify({ ...validScore, score: 150 })));
    await expect(scoreCandidate('jd text', extract)).rejects.toThrow();
  });

  it('rejects invalid verdict enum', async () => {
    mockChat().mockResolvedValue(makeChat(JSON.stringify({ ...validScore, verdict: 'maybe' })));
    await expect(scoreCandidate('jd text', extract)).rejects.toThrow();
  });

  it('includes JD and extract in user message', async () => {
    mockChat().mockResolvedValueOnce(makeChat(JSON.stringify(validScore)));
    await scoreCandidate('Senior React role', extract);
    const call = mockChat().mock.calls[0][0];
    expect(call.user).toContain('Senior React role');
    expect(call.user).toContain('Alice');
    expect(call.system).toContain('recruiter');
  });
});
