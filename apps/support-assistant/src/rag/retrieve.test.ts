import { describe, it, expect } from 'vitest';
import { retrieve } from './retrieve';
import { chunkDoc } from './chunker';

const mk = (id: string, text: string) =>
  chunkDoc({ id, title: id, text }, { strategy: 'by-file' })[0];

describe('retrieve (lexical)', () => {
  const chunks = [
    mk('a', 'mimecast domain flagged as phish false positive safelink'),
    mk('b', 'DKIM fail quarantine spf alignment'),
    mk('c', 'throttle eop sender rate limit'),
  ];

  it('ranks the chunk sharing most query terms first', () => {
    const res = retrieve('why is mimecast safelink flagged as phish', chunks, { topK: 1 });
    expect(res).toHaveLength(1);
    expect(res[0].chunk.docId).toBe('a');
  });

  it('respects topK upper bound', () => {
    const res = retrieve('mimecast phish quarantine', chunks, { topK: 1 });
    expect(res).toHaveLength(1);
  });

  it('returns only chunks sharing query terms (no fill)', () => {
    const res = retrieve('quarantine dkim spf', chunks, { topK: 3 });
    expect(res.every((r) => r.score > 0)).toBe(true);
    expect(res[0].chunk.docId).toBe('b');
  });

  it('empty query -> empty result', () => {
    expect(retrieve('', chunks, { topK: 3 })).toHaveLength(0);
  });

  it('minScore filters weak matches', () => {
    const res = retrieve('mimecast phish', chunks, { topK: 3, minScore: 1.5 });
    expect(res.length).toBeLessThanOrEqual(1);
  });

  it('ignores short/stop-word-ish tokens', () => {
    const res = retrieve('of the a is', chunks, { topK: 3 });
    expect(res).toHaveLength(0);
  });
});