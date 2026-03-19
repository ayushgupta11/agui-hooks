import { applyJsonPatch } from '../utils/jsonPatch';

describe('applyJsonPatch', () => {
  it('applies an add operation', () => {
    const doc = { a: 1 };
    const result = applyJsonPatch(doc, [{ op: 'add', path: '/b', value: 2 }]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('applies a replace operation', () => {
    const doc = { a: 1, b: 'old' };
    const result = applyJsonPatch(doc, [{ op: 'replace', path: '/b', value: 'new' }]);
    expect(result).toEqual({ a: 1, b: 'new' });
  });

  it('applies a remove operation', () => {
    const doc = { a: 1, b: 2 };
    const result = applyJsonPatch(doc, [{ op: 'remove', path: '/b' }]);
    expect(result).toEqual({ a: 1 });
  });

  it('does not mutate the original document', () => {
    const doc = { a: 1 };
    applyJsonPatch(doc, [{ op: 'add', path: '/b', value: 2 }]);
    expect(doc).toEqual({ a: 1 });
  });

  it('applies multiple operations in sequence', () => {
    const doc = { items: [] as number[] };
    const result = applyJsonPatch(doc, [
      { op: 'add', path: '/items/0', value: 1 },
      { op: 'add', path: '/items/1', value: 2 },
    ]);
    expect(result.items).toEqual([1, 2]);
  });
});
