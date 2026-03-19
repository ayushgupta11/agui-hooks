import {
  sanitizeInput,
  validateMessageLength,
  validateOrigin,
  createRateLimiter,
  buildRequestHeaders,
  MessageTooLongError,
  RateLimitError,
  OriginValidationError,
} from '../utils/security';

describe('sanitizeInput', () => {
  it('strips HTML tags (leaves content intact)', () => {
    // Tags are removed, inner content is preserved
    expect(sanitizeInput('<script>alert(1)</script>Hello')).toBe('alert(1)Hello');
    expect(sanitizeInput('<b>bold</b>')).toBe('bold');
    expect(sanitizeInput('<img src="x" />')).toBe('');
  });

  it('strips javascript: URIs', () => {
    expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
    // case-insensitive
    expect(sanitizeInput('JAVASCRIPT:evil')).toBe('evil');
  });

  it('strips inline event attributes', () => {
    const result = sanitizeInput('Hello onclick=bad world');
    expect(result).not.toContain('onclick');
  });

  it('leaves safe text unchanged', () => {
    const safe = 'Hello, world! How are you today?';
    expect(sanitizeInput(safe)).toBe(safe);
  });
});

describe('validateMessageLength', () => {
  it('passes for messages within limit', () => {
    expect(() => validateMessageLength('hello', 100)).not.toThrow();
  });

  it('throws MessageTooLongError when over limit', () => {
    expect(() => validateMessageLength('x'.repeat(10), 5)).toThrow(MessageTooLongError);
  });

  it('uses default limit of 8000', () => {
    expect(() => validateMessageLength('x'.repeat(8001))).toThrow(MessageTooLongError);
    expect(() => validateMessageLength('x'.repeat(8000))).not.toThrow();
  });
});

describe('validateOrigin', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('does nothing when allowedOrigins is empty', () => {
    expect(() => validateOrigin([])).not.toThrow();
  });

  it('passes when current origin is in the allowlist', () => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://myapp.com' },
      writable: true,
    });
    expect(() => validateOrigin(['https://myapp.com'])).not.toThrow();
  });

  it('throws OriginValidationError when origin is not in allowlist', () => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://evil.com' },
      writable: true,
    });
    expect(() => validateOrigin(['https://myapp.com'])).toThrow(OriginValidationError);
  });
});

describe('createRateLimiter', () => {
  it('allows requests up to the limit', () => {
    const limiter = createRateLimiter(3, 10_000);
    expect(limiter.check()).toBe(true);
    expect(limiter.check()).toBe(true);
    expect(limiter.check()).toBe(true);
  });

  it('rejects the request that exceeds the limit', () => {
    const limiter = createRateLimiter(2, 10_000);
    expect(limiter.check()).toBe(true);
    expect(limiter.check()).toBe(true);
    expect(limiter.check()).toBe(false);
  });

  it('allows requests again after the window expires', () => {
    jest.useFakeTimers();
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.check()).toBe(true);
    expect(limiter.check()).toBe(false);

    jest.advanceTimersByTime(1001);
    expect(limiter.check()).toBe(true);
    jest.useRealTimers();
  });
});

describe('buildRequestHeaders', () => {
  it('sets Content-Type and Accept', () => {
    const headers = buildRequestHeaders();
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('text/event-stream');
  });

  it('merges custom headers', () => {
    const headers = buildRequestHeaders({ Authorization: 'Bearer token' });
    expect(headers['Authorization']).toBe('Bearer token');
  });

  it('includes CSRF token string', () => {
    const headers = buildRequestHeaders({}, 'my-csrf-token');
    expect(headers['X-CSRF-Token']).toBe('my-csrf-token');
  });

  it('calls CSRF token factory function', () => {
    const factory = jest.fn().mockReturnValue('dynamic-token');
    const headers = buildRequestHeaders({}, factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(headers['X-CSRF-Token']).toBe('dynamic-token');
  });

  it('omits X-CSRF-Token when not provided', () => {
    const headers = buildRequestHeaders();
    expect(headers['X-CSRF-Token']).toBeUndefined();
  });
});
