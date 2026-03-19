import type { RetryConfig, AGUIEvent } from '../types';
import { parseChunk } from './eventParser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectionCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onEvent: (event: AGUIEvent) => void;
  onError: (error: Error) => void;
}

export interface ConnectionOptions {
  endpoint: string;
  headers: Record<string, string>;
  retryConfig: RetryConfig;
  callbacks: ConnectionCallbacks;
}

export interface Connection {
  connect(payload: unknown): Promise<void>;
  abort(): void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
  jitter: 0.2,
};

// ─── Backoff Calculation ──────────────────────────────────────────────────────

function calcDelay(attempt: number, config: RetryConfig): number {
  const base =
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(base, config.maxDelayMs);
  const jitterAmount = capped * config.jitter * (Math.random() * 2 - 1);
  return Math.max(0, capped + jitterAmount);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an SSE connection using `fetch` + `ReadableStream`.
 *
 * Using fetch (not EventSource) because:
 * - EventSource only supports GET with no custom headers
 * - We need POST body + Authorization / X-CSRF-Token headers
 *
 * The returned `connect()` runs a retry loop with exponential back-off.
 * Call `abort()` for a clean teardown at any time.
 */
export function createConnection(options: ConnectionOptions): Connection {
  const { endpoint, headers, retryConfig, callbacks } = options;
  let abortController: AbortController | null = null;
  let aborted = false;

  async function runStream(payload: unknown): Promise<void> {
    abortController = new AbortController();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Server responded with ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error('Response body is null — SSE not supported');
    }

    callbacks.onConnected();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parseChunk(chunk);
        for (const event of events) {
          callbacks.onEvent(event);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return {
    async connect(payload: unknown): Promise<void> {
      aborted = false;
      let attempt = 0;

      while (!aborted) {
        try {
          await runStream(payload);
          // Stream completed normally
          callbacks.onDisconnected();
          return;
        } catch (err) {
          if (aborted) {
            callbacks.onDisconnected();
            return;
          }

          const error =
            err instanceof Error ? err : new Error(String(err));

          // DOMException with name 'AbortError' means we cancelled intentionally
          if (error.name === 'AbortError') {
            callbacks.onDisconnected();
            return;
          }

          attempt++;
          if (attempt > retryConfig.maxAttempts) {
            callbacks.onError(
              new Error(
                `Connection failed after ${retryConfig.maxAttempts} attempts: ${error.message}`,
              ),
            );
            callbacks.onDisconnected();
            return;
          }

          callbacks.onError(error);
          const delay = calcDelay(attempt - 1, retryConfig);
          await sleep(delay);
        }
      }
    },

    abort(): void {
      aborted = true;
      abortController?.abort();
      abortController = null;
    },
  };
}
