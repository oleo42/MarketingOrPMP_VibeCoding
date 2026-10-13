import { describe, it, expect } from 'vitest';
import { parseCaseFile, parseCaseFiles } from './corpus';

// 注意：脱敏规则已收敛到 scripts/desensitize.py（单一真相源）。
// 本文件只测 corpus 包装层：case 判定 + 脱敏文本透传，不再测脱敏逻辑本身
// （否则会诱导双实现）。脱敏正确性由 desensitize.py 的零泄露验证保证。

describe('parseCaseFile', () => {
  it('returns CorpusDoc for #case files, passing text through verbatim', () => {
    const doc = parseCaseFile('#case\n\n# customer\nhello user@REDACTED.local', 'foo.md');
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('foo');
    expect(doc!.title).toBe('foo');
    // 已脱敏文本透传，不做二次改写
    expect(doc!.text).toContain('user@REDACTED.local');
  });

  it('returns null for non-case files', () => {
    expect(parseCaseFile('# 我是一篇哲学笔记\n...', 'philosophy.md')).toBeNull();
    expect(parseCaseFile('just a travel diary', 'travel.md')).toBeNull();
  });

  it('detects #case appearing mid-file (not only at byte 0)', () => {
    const doc = parseCaseFile('some preamble\n\n#case\n\n# customer\nhi', 'mid.md');
    expect(doc).not.toBeNull();
  });
});

describe('parseCaseFiles', () => {
  it('skips non-case files, keeps case files', () => {
    const docs = parseCaseFiles([
      { filename: 'case1.md', content: '#case\n\nhi' },
      { filename: 'philosophy.md', content: '# 禅宗\n...' },
      { filename: 'case2.md', content: '#case\n\nmore' },
    ]);
    expect(docs.map((d) => d.id)).toEqual(['case1', 'case2']);
  });
});