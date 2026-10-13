import { describe, it, expect } from 'vitest';
import { emailSecurityConfig, AnswerSchema } from './domain';

describe('email-security domain.ts (only handwritten layer)', () => {
  it('AnswerSchema accepts valid shaped answer', () => {
    const valid = { answer: 'DKIM alignment failed', cited_case_ids: ['DKIM fail quarantine'], confidence: 0.9 };
    expect(AnswerSchema.parse(valid)).toEqual(valid);
  });

  it('AnswerSchema rejects malformed answer', () => {
    expect(() => AnswerSchema.parse({ answer: 1, cited_case_ids: 'x', confidence: 'high' })).toThrow();
    expect(() => AnswerSchema.parse({ answer: 'ok', cited_case_ids: [1], confidence: 0.5 })).toThrow();
  });

  it('config exposes system prompt with domain vocabulary + schema', () => {
    expect(emailSecurityConfig.system).toContain('Microsoft 365 email security');
    expect(emailSecurityConfig.system).toContain('cited_case_ids');
    expect(emailSecurityConfig.schema).toBe(AnswerSchema);
  });
});