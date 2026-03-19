import { parseSseLine, parseChunk } from '../utils/eventParser';

describe('parseSseLine', () => {
  it('returns ok:false for empty lines', () => {
    expect(parseSseLine('').ok).toBe(false);
    expect(parseSseLine('   ').ok).toBe(false);
  });

  it('returns ok:false for SSE comment lines', () => {
    expect(parseSseLine(': heartbeat').ok).toBe(false);
  });

  it('parses a valid data: line', () => {
    const result = parseSseLine('data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe('RUN_STARTED');
    }
  });

  it('parses a line without the data: prefix', () => {
    const result = parseSseLine('{"type":"RUN_FINISHED","threadId":"t1","runId":"r1"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe('RUN_FINISHED');
    }
  });

  it('wraps unknown event types as RAW', () => {
    const result = parseSseLine('data: {"type":"UNKNOWN_TYPE","data":"stuff"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe('RAW');
    }
  });

  it('wraps non-JSON payloads as RAW', () => {
    const result = parseSseLine('data: not valid json at all');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe('RAW');
    }
  });

  it('adds a timestamp if absent', () => {
    const result = parseSseLine('data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.timestamp).toBeGreaterThan(0);
    }
  });

  it('returns ok:false for empty data payload after prefix', () => {
    const result = parseSseLine('data:   ');
    expect(result.ok).toBe(false);
  });
});

describe('parseChunk', () => {
  it('returns an array of parsed events', () => {
    const chunk = [
      'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}',
      'data: {"type":"RUN_FINISHED","threadId":"t1","runId":"r1"}',
    ].join('\n');

    const events = parseChunk(chunk);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('RUN_STARTED');
    expect(events[1].type).toBe('RUN_FINISHED');
  });

  it('skips blank lines', () => {
    const chunk = '\ndata: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}\n\n';
    const events = parseChunk(chunk);
    expect(events).toHaveLength(1);
  });

  it('returns empty array for empty chunk', () => {
    expect(parseChunk('')).toEqual([]);
  });
});
