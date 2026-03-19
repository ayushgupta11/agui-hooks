/**
 * Security utilities — all pure, stateless, no React dependency.
 */

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class MessageTooLongError extends Error {
  constructor(length: number, max: number) {
    super(`Message length ${length} exceeds maximum allowed ${max} characters`);
    this.name = 'MessageTooLongError';
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('Rate limit exceeded. Please wait before sending another message.');
    this.name = 'RateLimitError';
  }
}

export class OriginValidationError extends Error {
  constructor(origin: string) {
    super(`Origin "${origin}" is not in the allowed origins list`);
    this.name = 'OriginValidationError';
  }
}

// ─── Input Sanitization ───────────────────────────────────────────────────────

const HTML_TAG_RE = /<[^>]*>/g;
const JS_URI_RE = /javascript\s*:/gi;
const DATA_URI_RE = /data\s*:/gi;
const EVENT_ATTR_RE = /\s+on\w+\s*=/gi;
const VBSCRIPT_URI_RE = /vbscript\s*:/gi;

/**
 * Strips HTML tags, javascript: / data: URIs, and inline event attributes
 * from a user-supplied string. Does not modify whitespace or encoding.
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(HTML_TAG_RE, '')
    .replace(JS_URI_RE, '')
    .replace(DATA_URI_RE, '')
    .replace(VBSCRIPT_URI_RE, '')
    .replace(EVENT_ATTR_RE, '');
}

// ─── Length Validation ────────────────────────────────────────────────────────

export function validateMessageLength(
  input: string,
  maxLength: number = 8000,
): void {
  if (input.length > maxLength) {
    throw new MessageTooLongError(input.length, maxLength);
  }
}

// ─── Origin Validation ────────────────────────────────────────────────────────

/**
 * Checks `window.location.origin` against an allowlist.
 * No-ops in non-browser environments.
 */
export function validateOrigin(allowedOrigins: string[]): void {
  if (typeof window === 'undefined') return;
  if (allowedOrigins.length === 0) return;

  const current = window.location.origin;
  if (!allowedOrigins.includes(current)) {
    throw new OriginValidationError(current);
  }
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

export interface RateLimiter {
  /** Returns true if the request is allowed; false if rate-limited */
  check(): boolean;
}

/**
 * Creates a sliding-window token-bucket rate limiter.
 *
 * @param maxRequests - Maximum requests allowed per window
 * @param windowMs    - Window size in milliseconds
 */
export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
): RateLimiter {
  const timestamps: number[] = [];

  return {
    check(): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Evict timestamps outside the window
      while (timestamps.length > 0 && timestamps[0] < windowStart) {
        timestamps.shift();
      }

      if (timestamps.length >= maxRequests) {
        return false;
      }

      timestamps.push(now);
      return true;
    },
  };
}

// ─── Request Headers ─────────────────────────────────────────────────────────

/**
 * Merges caller-supplied headers with Content-Type and optional CSRF token.
 */
export function buildRequestHeaders(
  customHeaders: Record<string, string> = {},
  csrfToken?: string | (() => string),
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...customHeaders,
  };

  if (csrfToken) {
    headers['X-CSRF-Token'] =
      typeof csrfToken === 'function' ? csrfToken() : csrfToken;
  }

  return headers;
}
