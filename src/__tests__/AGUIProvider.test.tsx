import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AGUIProvider } from '../provider/AGUIProvider';
import { useAGUI } from '../hooks/useAGUI';
import type { AGUIProviderProps, AGUIEvent } from '../types';

// ─── Mock createConnection ────────────────────────────────────────────────────

jest.mock('../utils/connection', () => ({
  ...jest.requireActual('../utils/connection'),
  createConnection: jest.fn(),
}));

import { createConnection } from '../utils/connection';
const mockCreateConnection = createConnection as jest.MockedFunction<typeof createConnection>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(props: Partial<AGUIProviderProps> = {}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AGUIProvider endpoint="http://localhost:8000/agent" {...props}>
        {children}
      </AGUIProvider>
    );
  };
}

/**
 * Creates a mock connection that fires the given events then completes.
 */
function makeConnection(events: AGUIEvent[]) {
  return {
    connect: jest.fn(async () => {
      // Defer event delivery so React can process each one
      for (const event of events) {
        await Promise.resolve();
        mockCallbacks?.onEvent(event);
      }
      mockCallbacks?.onDisconnected();
    }),
    abort: jest.fn(),
  };
}

let mockCallbacks: Parameters<typeof createConnection>[0]['callbacks'] | null = null;

beforeEach(() => {
  mockCallbacks = null;
  mockCreateConnection.mockImplementation((opts) => {
    mockCallbacks = opts.callbacks;
    const conn = makeConnection([]);
    // Override connect to call our own event sequence
    return conn;
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AGUIProvider', () => {
  it('renders children without crashing', () => {
    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper(),
    });
    expect(result.current).toBeDefined();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it('exposes correct initial context values', () => {
    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.error).toBeNull();
    expect(result.current.events).toEqual([]);
    expect(result.current.currentRun).toBeNull();
    expect(result.current.agentState).toEqual({});
  });

  it('calls onRunStarted handler when RUN_STARTED event is received', async () => {
    const onRunStarted = jest.fn();
    const events: AGUIEvent[] = [
      { type: 'RUN_STARTED', threadId: 't1', runId: 'r1', timestamp: Date.now() },
    ];

    mockCreateConnection.mockImplementationOnce((opts) => {
      mockCallbacks = opts.callbacks;
      return {
        connect: jest.fn(async () => {
          opts.callbacks.onConnected();
          for (const event of events) {
            await Promise.resolve();
            opts.callbacks.onEvent(event);
          }
          opts.callbacks.onDisconnected();
        }),
        abort: jest.fn(),
      };
    });

    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper({ onRunStarted }),
    });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(onRunStarted).toHaveBeenCalledTimes(1);
      expect(onRunStarted).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RUN_STARTED', runId: 'r1' }),
      );
    });
  });

  it('assembles messages from TEXT_MESSAGE_START / CONTENT / END events', async () => {
    const now = Date.now();
    const events: AGUIEvent[] = [
      { type: 'RUN_STARTED', threadId: 't1', runId: 'r1', timestamp: now },
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant', timestamp: now },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello', timestamp: now },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: ', world', timestamp: now },
      { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: now },
      { type: 'RUN_FINISHED', threadId: 't1', runId: 'r1', timestamp: now },
    ];

    mockCreateConnection.mockImplementationOnce((opts) => ({
      connect: jest.fn(async () => {
        opts.callbacks.onConnected();
        for (const event of events) {
          await Promise.resolve();
          opts.callbacks.onEvent(event);
        }
        opts.callbacks.onDisconnected();
      }),
      abort: jest.fn(),
    }));

    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper({ debounceMs: 0 }),
    });

    await act(async () => {
      await result.current.sendMessage('test');
    });

    await waitFor(() => {
      const msgs = result.current.messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('Hello, world');
      expect(msgs[0].role).toBe('assistant');
      expect(msgs[0].isStreaming).toBe(false);
    });
  });

  it('applies STATE_SNAPSHOT event to agentState', async () => {
    const events: AGUIEvent[] = [
      { type: 'STATE_SNAPSHOT', snapshot: { counter: 42, mode: 'chat' }, timestamp: Date.now() },
    ];

    mockCreateConnection.mockImplementationOnce((opts) => ({
      connect: jest.fn(async () => {
        opts.callbacks.onConnected();
        for (const event of events) {
          await Promise.resolve();
          opts.callbacks.onEvent(event);
        }
        opts.callbacks.onDisconnected();
      }),
      abort: jest.fn(),
    }));

    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.sendMessage('test');
    });

    await waitFor(() => {
      expect(result.current.agentState).toEqual({ counter: 42, mode: 'chat' });
    });
  });

  it('enforces rate limit', async () => {
    const events: AGUIEvent[] = [
      { type: 'RUN_STARTED', threadId: 't1', runId: 'r1', timestamp: Date.now() },
      { type: 'RUN_FINISHED', threadId: 't1', runId: 'r1', timestamp: Date.now() },
    ];

    mockCreateConnection.mockImplementation((opts) => ({
      connect: jest.fn(async () => {
        opts.callbacks.onConnected();
        for (const event of events) {
          await Promise.resolve();
          opts.callbacks.onEvent(event);
        }
        opts.callbacks.onDisconnected();
      }),
      abort: jest.fn(),
    }));

    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper({
        security: { rateLimit: { maxRequests: 1, windowMs: 60_000 } },
      }),
    });

    await act(async () => {
      await result.current.sendMessage('first');
    });

    await expect(
      act(async () => {
        await result.current.sendMessage('second — should be rate limited');
      }),
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('clearHistory resets messages and events', async () => {
    const now = Date.now();
    const events: AGUIEvent[] = [
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant', timestamp: now },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'hi', timestamp: now },
      { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: now },
    ];

    mockCreateConnection.mockImplementationOnce((opts) => ({
      connect: jest.fn(async () => {
        opts.callbacks.onConnected();
        for (const event of events) {
          await Promise.resolve();
          opts.callbacks.onEvent(event);
        }
        opts.callbacks.onDisconnected();
      }),
      abort: jest.fn(),
    }));

    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper({ debounceMs: 0 }),
    });

    await act(async () => {
      await result.current.sendMessage('test');
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.events).toHaveLength(0);
  });

  it('middleware can cancel events', async () => {
    const onRunStarted = jest.fn();
    const events: AGUIEvent[] = [
      { type: 'RUN_STARTED', threadId: 't1', runId: 'r1', timestamp: Date.now() },
    ];

    mockCreateConnection.mockImplementationOnce((opts) => ({
      connect: jest.fn(async () => {
        opts.callbacks.onConnected();
        for (const event of events) {
          await Promise.resolve();
          opts.callbacks.onEvent(event);
        }
        opts.callbacks.onDisconnected();
      }),
      abort: jest.fn(),
    }));

    const { result } = renderHook(() => useAGUI(), {
      wrapper: makeWrapper({
        onRunStarted,
        middleware: [
          {
            eventType: 'RUN_STARTED',
            before: () => false, // cancel
          },
        ],
      }),
    });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    await waitFor(() => expect(mockCreateConnection).toHaveBeenCalled());
    expect(onRunStarted).not.toHaveBeenCalled();
  });
});
