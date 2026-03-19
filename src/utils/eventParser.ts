import { EventType } from '../constants/events';
import type { AGUIEvent, RawEvent } from '../types';

// ─── Result type ──────────────────────────────────────────────────────────────

export type ParseResult<T> =
  | { ok: true; event: T }
  | { ok: false; error: string };

// ─── Known event type set ─────────────────────────────────────────────────────

const KNOWN_TYPES = new Set<string>(Object.values(EventType));

// ─── Single SSE line parser ───────────────────────────────────────────────────

/**
 * Parses a single SSE `data:` line into an `AGUIEvent`.
 * Never throws — unknown / malformed events are wrapped as `RAW`.
 */
export function parseSseLine(line: string): ParseResult<AGUIEvent> {
  const trimmed = line.trim();

  // Skip blank lines and SSE comment lines
  if (!trimmed || trimmed.startsWith(':')) {
    return { ok: false, error: 'empty or comment line' };
  }

  // Strip the optional "data: " prefix
  const raw = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed;

  if (!raw) {
    return { ok: false, error: 'empty data payload' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Treat un-parseable payloads as RAW events
    const rawEvent: RawEvent = {
      type: 'RAW',
      event: raw,
      data: raw,
      timestamp: Date.now(),
    };
    return { ok: true, event: rawEvent };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    const rawEvent: RawEvent = {
      type: 'RAW',
      event: String(parsed),
      data: parsed,
      timestamp: Date.now(),
    };
    return { ok: true, event: rawEvent };
  }

  const obj = parsed as Record<string, unknown>;

  // If type is unknown, wrap as RAW
  if (typeof obj['type'] !== 'string' || !KNOWN_TYPES.has(obj['type'])) {
    const rawEvent: RawEvent = {
      type: 'RAW',
      event: String(obj['type'] ?? 'unknown'),
      data: obj,
      timestamp: Date.now(),
    };
    return { ok: true, event: rawEvent };
  }

  // Attach a timestamp if absent
  if (!obj['timestamp']) {
    obj['timestamp'] = Date.now();
  }

  return { ok: true, event: obj as unknown as AGUIEvent };
}

// ─── Chunk parser ─────────────────────────────────────────────────────────────

/**
 * Splits a raw SSE chunk on newlines and returns successfully-parsed events.
 */
export function parseChunk(chunk: string): AGUIEvent[] {
  const events: AGUIEvent[] = [];
  const lines = chunk.split('\n');

  for (const line of lines) {
    const result = parseSseLine(line);
    if (result.ok) {
      events.push(result.event);
    }
  }

  return events;
}
