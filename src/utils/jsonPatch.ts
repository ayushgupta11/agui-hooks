import { applyPatch, deepClone } from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';

export type { Operation };

/**
 * Applies an RFC 6902 JSON Patch to a document immutably.
 * Clones the document before patching so the original is never mutated.
 *
 * @param document - The source object
 * @param patch    - Array of RFC 6902 patch operations
 * @returns        New patched document
 * @throws         If any patch operation is invalid (validate=true)
 */
export function applyJsonPatch<T extends object>(
  document: T,
  patch: Operation[],
): T {
  const cloned = deepClone(document);
  applyPatch(cloned, patch, /* validate */ true);
  return cloned;
}
