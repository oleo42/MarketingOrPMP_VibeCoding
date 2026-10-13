import { describe, it, expect } from 'vitest';
import { chunkDoc, chunkAll, type CorpusDoc } from './chunker';

const doc = (id: string, text: string): CorpusDoc => ({ id, title: id, text });

describe('chunker by-file', () => {
  it('whole file = one chunk, total=1', () => {
    const chunks = chunkDoc(doc('case1', 'symptom\ncause\nresolution'), { strategy: 'by-file' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].meta.total).toBe(1);
    expect(chunks[0].id).toBe('case1:0');
  });

  it('empty file -> no chunks', () => {
    expect(chunkDoc(doc('empty', '  \n '), { strategy: 'by-file' })).toHaveLength(0);
  });
});

describe('chunker by-heading', () => {
  // by-heading 适用于"父节带正文"的文档（如产品手册）；纯容器父 heading（case 的 # customer）会被丢弃，那是 by-file 的场景
  const md =
    '# customer\npreface text for customer section\n\n## discription\nhello\n\n# solve\ncause intro\n## cause\nreal answer here';

  it('splits on headings, keeps heading text', () => {
    const chunks = chunkDoc(doc('c', md), { strategy: 'by-heading' });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toContain('# customer');
    expect(chunks.some((c) => c.text.includes('real answer here'))).toBe(true);
  });

  it('drops heading-only shell chunks (empty ## cause)', () => {
    const empty = '# solve\n## cause\n\n## resolution\n';
    const chunks = chunkDoc(doc('c', empty), { strategy: 'by-heading' });
    expect(chunks).toHaveLength(0);
  });

  it('preserves total across chunks', () => {
    const chunks = chunkDoc(doc('c', md), { strategy: 'by-heading' });
    expect(chunks.every((c) => c.meta.total === chunks.length)).toBe(true);
  });
});

describe('chunker by-size', () => {
  it('short text = one chunk', () => {
    const chunks = chunkDoc(doc('c', 'short'), { strategy: 'by-size', maxChars: 100 });
    expect(chunks).toHaveLength(1);
  });

  it('long text splits, respects maxChars upper bound', () => {
    const long = 'word '.repeat(5000); // 25000 chars
    const chunks = chunkDoc(doc('c', long), { strategy: 'by-size', maxChars: 1200, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.every((c) => c.meta.total === chunks.length)).toBe(true);
    expect(chunks.every((c) => c.text.length <= 1200)).toBe(true);
  });
});

describe('chunkAll', () => {
  it('flattens multiple docs', () => {
    const chunks = chunkAll([doc('a', 'one'), doc('b', 'two')], { strategy: 'by-file' });
    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.docId).sort()).toEqual(['a', 'b']);
  });
});