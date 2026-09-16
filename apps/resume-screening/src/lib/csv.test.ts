import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('serializes plain rows', () => {
    const csv = toCsv([
      { a: 1, b: 'hello' },
      { a: 2, b: 'world' },
    ]);
    expect(csv).toBe('a,b\r\n1,hello\r\n2,world');
  });

  it('escapes quotes, commas and newlines', () => {
    const csv = toCsv([{ a: 'say "hi"', b: 'x,y', c: 'line1\nline2' }]);
    expect(csv).toBe('a,b,c\r\n"say ""hi""","x,y","line1\nline2"');
  });

  it('renders null/undefined as empty cell', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv).toBe('a,b,c\r\n,,0');
  });

  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});
