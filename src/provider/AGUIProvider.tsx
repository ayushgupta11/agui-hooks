import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { Operation } from 'fast-json-patch';
import { AGUIContext } from '../context/AGUIContext';
import { createConnection, DEFAULT_RETRY_CONFIG } from '../utils/connection';
import type { Connection } from '../utils/connection';
import {
  buildRequestHeaders,
  createRateLimiter,
  RateLimitError,
  sanitizeInput,
  validateMessageLength,
  validateOrigin,
} from '../utils/security';
import { applyJsonPatch } from '../utils/jsonPatch';
import type {
  AGUIContextValue,
  AGUIEvent,
  AGUIProviderProps,
  EventHandler,
  Message,
  RetryConfig,
  RunState,
} from '../types';

// ─── State ────────────────────────────────────────────────────────────────────

interface ProviderState {
  isConnected: boolean;
  isRunning: boolean;
  error: Error | null;
  messages: Message[];
  events: AGUIEvent[];
  currentRun: RunState | null;
  agentState: Record<string, unknown>;
}

const INITIAL_STATE: ProviderState = {
  isConnected: false,
  isRunning: false,
  error: null,
  messages: [],
  events: [],
  currentRun: null,
  agentState: {},
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_RUNNING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: Error | null }
  | { type: 'ADD_EVENT'; payload: { event: AGUIEvent; maxHistory: number } }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; delta: string } }
  | { type: 'COMPLETE_MESSAGE'; payload: { id: string } }
  | { type: 'SET_RUN'; payload: RunState | null }
  | { type: 'APPLY_STATE_PATCH'; payload: Operation[] }
  | { type: 'SET_AGENT_STATE'; payload: Record<string, unknown> }
  | { type: 'CLEAR_HISTORY' };

function reducer(state: ProviderState, action: Action): ProviderState {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };

    case 'SET_RUNNING':
      return { ...state, isRunning: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'ADD_EVENT': {
      const events = [...state.events, action.payload.event];
      if (events.length > action.payload.maxHistory) {
        events.splice(0, events.length - action.payload.maxHistory);
      }
      return { ...state, events };
    }

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.payload.id
            ? { ...m, content: m.content + action.payload.delta }
            : m,
        ),
      };

    case 'COMPLETE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.payload.id ? { ...m, isStreaming: false } : m,
        ),
      };

    case 'SET_RUN':
      return { ...state, currentRun: action.payload };

    case 'APPLY_STATE_PATCH': {
      try {
        const patched = applyJsonPatch(state.agentState, action.payload);
        return { ...state, agentState: patched };
      } catch {
        return state;
      }
    }

    case 'SET_AGENT_STATE':
      return { ...state, agentState: action.payload };

    case 'CLEAR_HISTORY':
      return { ...state, messages: [], events: [] };

    default:
      return state;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_HISTORY = 500;
const DEFAULT_DEBOUNCE_MS = 16;

export function AGUIProvider({
  endpoint,
  headers: customHeaders,
  children,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxEventHistory = DEFAULT_MAX_HISTORY,
  security = {},
  retryConfig: retryConfigProp,
  middleware = [],
  customEventHandlers = {},
  // Lifecycle handlers
  onRunStarted,
  onRunFinished,
  onRunError,
  onStepStarted,
  onStepFinished,
  onTextMessageStart,
  onTextMessageContent,
  onTextMessageEnd,
  onToolCallStart,
  onToolCallArgs,
  onToolCallEnd,
  onToolCallResult,
  onStateSnapshot,
  onStateDelta,
  onMessagesSnapshot,
  onRaw,
  onCustom,
}: AGUIProviderProps) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // ── Config refs (avoid stale closure issues) ──────────────────────────────
  const retryConfig: RetryConfig = useMemo(
    () => ({ ...DEFAULT_RETRY_CONFIG, ...retryConfigProp }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(retryConfigProp)],
  );

  const securityRef = useRef(security);
  securityRef.current = security;

  const middlewareRef = useRef(middleware);
  middlewareRef.current = middleware;

  // ── Rate limiter (created once per security config change) ────────────────
  const rateLimiterRef = useRef(
    security.rateLimit
      ? createRateLimiter(
          security.rateLimit.maxRequests,
          security.rateLimit.windowMs,
        )
      : null,
  );

  useEffect(() => {
    rateLimiterRef.current = security.rateLimit
      ? createRateLimiter(
          security.rateLimit.maxRequests,
          security.rateLimit.windowMs,
        )
      : null;
  }, [security.rateLimit]);

  // ── Subscriber registry ───────────────────────────────────────────────────
  type HandlerSet = Set<EventHandler<AGUIEvent>>;
  const subscribersRef = useRef<Map<string, HandlerSet>>(new Map());

  // ── Debounce timer refs ───────────────────────────────────────────────────
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeltasRef = useRef<Map<string, string>>(new Map());

  const flushPendingDeltas = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingDeltasRef.current.forEach((delta, id) => {
      dispatch({ type: 'UPDATE_MESSAGE', payload: { id, delta } });
    });
    pendingDeltasRef.current.clear();
  }, []);

  // ── Connection ref ────────────────────────────────────────────────────────
  const connectionRef = useRef<Connection | null>(null);

  // ── Origin validation on mount ────────────────────────────────────────────
  useEffect(() => {
    const { allowedOrigins } = securityRef.current;
    if (allowedOrigins && allowedOrigins.length > 0) {
      try {
        validateOrigin(allowedOrigins);
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }, []); // run once on mount

  // ── Middleware runner ─────────────────────────────────────────────────────
  const runMiddlewareBefore = useCallback(
    async (event: AGUIEvent): Promise<boolean> => {
      for (const mw of middlewareRef.current) {
        if (mw.eventType !== '*' && mw.eventType !== event.type) continue;
        if (!mw.before) continue;
        const result = await mw.before(event);
        if (result === false) return false;
      }
      return true;
    },
    [],
  );

  const runMiddlewareAfter = useCallback(async (event: AGUIEvent) => {
    for (const mw of middlewareRef.current) {
      if (mw.eventType !== '*' && mw.eventType !== event.type) continue;
      if (!mw.after) continue;
      await mw.after(event);
    }
  }, []);

  // ── Prop handler map ──────────────────────────────────────────────────────
  const propHandlersRef = useRef({
    onRunStarted,
    onRunFinished,
    onRunError,
    onStepStarted,
    onStepFinished,
    onTextMessageStart,
    onTextMessageContent,
    onTextMessageEnd,
    onToolCallStart,
    onToolCallArgs,
    onToolCallEnd,
    onToolCallResult,
    onStateSnapshot,
    onStateDelta,
    onMessagesSnapshot,
    onRaw,
    onCustom,
  });
  propHandlersRef.current = {
    onRunStarted,
    onRunFinished,
    onRunError,
    onStepStarted,
    onStepFinished,
    onTextMessageStart,
    onTextMessageContent,
    onTextMessageEnd,
    onToolCallStart,
    onToolCallArgs,
    onToolCallEnd,
    onToolCallResult,
    onStateSnapshot,
    onStateDelta,
    onMessagesSnapshot,
    onRaw,
    onCustom,
  };

  const customHandlersRef = useRef(customEventHandlers);
  customHandlersRef.current = customEventHandlers;

  // ── Core event dispatcher ─────────────────────────────────────────────────
  const handleEvent = useCallback(
    async (event: AGUIEvent) => {
      // 1. Run "before" middleware — may cancel the event
      const proceed = await runMiddlewareBefore(event);
      if (!proceed) return;

      // 2. Dispatch to reducer
      dispatch({
        type: 'ADD_EVENT',
        payload: { event, maxHistory: maxEventHistory },
      });

      // 3. State machine: handle each event type
      const h = propHandlersRef.current;
      switch (event.type) {
        case 'RUN_STARTED':
          dispatch({
            type: 'SET_RUN',
            payload: {
              threadId: event.threadId,
              runId: event.runId,
              startedAt: Date.now(),
            },
          });
          dispatch({ type: 'SET_RUNNING', payload: true });
          dispatch({ type: 'SET_ERROR', payload: null });
          h.onRunStarted?.(event);
          break;

        case 'RUN_FINISHED':
          dispatch({ type: 'SET_RUNNING', payload: false });
          h.onRunFinished?.(event);
          break;

        case 'RUN_ERROR':
          dispatch({
            type: 'SET_ERROR',
            payload: new Error(event.message),
          });
          dispatch({ type: 'SET_RUNNING', payload: false });
          h.onRunError?.(event);
          break;

        case 'STEP_STARTED':
          h.onStepStarted?.(event);
          break;

        case 'STEP_FINISHED':
          h.onStepFinished?.(event);
          break;

        case 'TEXT_MESSAGE_START': {
          const msg: Message = {
            id: event.messageId,
            role: event.role,
            content: '',
            createdAt: event.timestamp ?? Date.now(),
            isStreaming: true,
          };
          dispatch({ type: 'ADD_MESSAGE', payload: msg });
          h.onTextMessageStart?.(event);
          break;
        }

        case 'TEXT_MESSAGE_CONTENT': {
          // Debounced accumulation
          const existing = pendingDeltasRef.current.get(event.messageId) ?? '';
          pendingDeltasRef.current.set(event.messageId, existing + event.delta);

          if (debounceTimerRef.current === null) {
            debounceTimerRef.current = setTimeout(() => {
              debounceTimerRef.current = null;
              pendingDeltasRef.current.forEach((delta, id) => {
                dispatch({ type: 'UPDATE_MESSAGE', payload: { id, delta } });
              });
              pendingDeltasRef.current.clear();
            }, debounceMs);
          }

          h.onTextMessageContent?.(event);
          break;
        }

        case 'TEXT_MESSAGE_END':
          // Flush any pending delta before marking complete
          flushPendingDeltas();
          dispatch({
            type: 'COMPLETE_MESSAGE',
            payload: { id: event.messageId },
          });
          h.onTextMessageEnd?.(event);
          break;

        case 'TOOL_CALL_START':
          h.onToolCallStart?.(event);
          break;

        case 'TOOL_CALL_ARGS':
          h.onToolCallArgs?.(event);
          break;

        case 'TOOL_CALL_END':
          h.onToolCallEnd?.(event);
          break;

        case 'TOOL_CALL_RESULT':
          h.onToolCallResult?.(event);
          break;

        case 'STATE_SNAPSHOT':
          dispatch({ type: 'SET_AGENT_STATE', payload: event.snapshot });
          h.onStateSnapshot?.(event);
          break;

        case 'STATE_DELTA':
          dispatch({ type: 'APPLY_STATE_PATCH', payload: event.delta });
          h.onStateDelta?.(event);
          break;

        case 'MESSAGES_SNAPSHOT':
          // Replace messages with snapshot
          event.messages.forEach((msg) => {
            dispatch({ type: 'ADD_MESSAGE', payload: msg });
          });
          h.onMessagesSnapshot?.(event);
          break;

        case 'RAW':
          h.onRaw?.(event);
          break;

        case 'CUSTOM': {
          const customHandler = customHandlersRef.current[event.name];
          customHandler?.(event);
          h.onCustom?.(event);
          break;
        }
      }

      // 4. Notify subscribers
      const notifySet = (set: HandlerSet | undefined) => {
        if (!set) return;
        set.forEach((handler) => {
          void handler(event);
        });
      };
      notifySet(subscribersRef.current.get(event.type));
      notifySet(subscribersRef.current.get('*'));

      // 5. Run "after" middleware
      await runMiddlewareAfter(event);
    },
    [maxEventHistory, debounceMs, flushPendingDeltas, runMiddlewareBefore, runMiddlewareAfter],
  );

  // ── sendMessage ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string, metadata?: Record<string, unknown>) => {
      const sec = securityRef.current;

      // Sanitize
      let processed = sec.sanitizeInput !== false ? sanitizeInput(content) : content;

      // Length check
      const maxLen = sec.maxMessageLength ?? 8000;
      validateMessageLength(processed, maxLen);

      // Rate limit
      if (rateLimiterRef.current && !rateLimiterRef.current.check()) {
        throw new RateLimitError();
      }

      const headers = buildRequestHeaders(customHeaders, sec.csrfToken);

      const connection = createConnection({
        endpoint,
        headers,
        retryConfig,
        callbacks: {
          onConnected: () => dispatch({ type: 'SET_CONNECTED', payload: true }),
          onDisconnected: () => {
            dispatch({ type: 'SET_CONNECTED', payload: false });
            dispatch({ type: 'SET_RUNNING', payload: false });
          },
          onEvent: handleEvent,
          onError: (err) => dispatch({ type: 'SET_ERROR', payload: err }),
        },
      });

      connectionRef.current?.abort();
      connectionRef.current = connection;

      const payload = { message: processed, metadata };
      await connection.connect(payload);
    },
    [endpoint, customHeaders, retryConfig, handleEvent],
  );

  // ── stopRun ───────────────────────────────────────────────────────────────
  const stopRun = useCallback(() => {
    connectionRef.current?.abort();
    connectionRef.current = null;
  }, []);

  // ── clearHistory ──────────────────────────────────────────────────────────
  const clearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR_HISTORY' });
  }, []);

  // ── on (subscribe) ────────────────────────────────────────────────────────
  const on = useCallback(
    <T extends AGUIEvent>(
      eventType: T['type'] | '*',
      handler: EventHandler<T>,
    ) => {
      const key = eventType as string;
      if (!subscribersRef.current.has(key)) {
        subscribersRef.current.set(key, new Set());
      }
      subscribersRef.current.get(key)!.add(handler as EventHandler<AGUIEvent>);

      return () => {
        subscribersRef.current.get(key)?.delete(handler as EventHandler<AGUIEvent>);
      };
    },
    [],
  );

  // ── emit ──────────────────────────────────────────────────────────────────
  const emit = useCallback(
    (name: string, value: unknown) => {
      const customEv = {
        type: 'CUSTOM' as const,
        name,
        value,
        timestamp: Date.now(),
      };
      void handleEvent(customEv);
    },
    [handleEvent],
  );

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      connectionRef.current?.abort();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── Memoized context value ────────────────────────────────────────────────
  const contextValue: AGUIContextValue = useMemo(
    () => ({
      isConnected: state.isConnected,
      isRunning: state.isRunning,
      error: state.error,
      messages: state.messages,
      events: state.events,
      currentRun: state.currentRun,
      agentState: state.agentState,
      sendMessage,
      stopRun,
      clearHistory,
      on,
      emit,
    }),
    [
      state.isConnected,
      state.isRunning,
      state.error,
      state.messages,
      state.events,
      state.currentRun,
      state.agentState,
      sendMessage,
      stopRun,
      clearHistory,
      on,
      emit,
    ],
  );

  return (
    <AGUIContext.Provider value={contextValue}>
      {children}
    </AGUIContext.Provider>
  );
}
