import type { EventTypeName } from '../constants/events';

// ─── Base ────────────────────────────────────────────────────────────────────

export interface BaseEvent {
  type: EventTypeName;
  timestamp?: number;
}

// ─── Domain Models ───────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  createdAt: number;
  isStreaming?: boolean;
}

export interface RunState {
  threadId: string;
  runId: string;
  startedAt: number;
  currentStep?: string;
}

// ─── Event Interfaces ────────────────────────────────────────────────────────

export interface RunStartedEvent extends BaseEvent {
  type: 'RUN_STARTED';
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent extends BaseEvent {
  type: 'RUN_FINISHED';
  threadId: string;
  runId: string;
}

export interface RunErrorEvent extends BaseEvent {
  type: 'RUN_ERROR';
  message: string;
  code?: string;
}

export interface StepStartedEvent extends BaseEvent {
  type: 'STEP_STARTED';
  stepName: string;
  stepId?: string;
}

export interface StepFinishedEvent extends BaseEvent {
  type: 'STEP_FINISHED';
  stepName: string;
  stepId?: string;
}

export interface TextMessageStartEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_START';
  messageId: string;
  role: MessageRole;
}

export interface TextMessageContentEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_END';
  messageId: string;
}

export interface ToolCallStartEvent extends BaseEvent {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent extends BaseEvent {
  type: 'TOOL_CALL_ARGS';
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends BaseEvent {
  type: 'TOOL_CALL_END';
  toolCallId: string;
}

export interface ToolCallResultEvent extends BaseEvent {
  type: 'TOOL_CALL_RESULT';
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface StateSnapshotEvent extends BaseEvent {
  type: 'STATE_SNAPSHOT';
  snapshot: Record<string, unknown>;
}

export interface StateDeltaEvent extends BaseEvent {
  type: 'STATE_DELTA';
  delta: import('fast-json-patch').Operation[];
}

export interface MessagesSnapshotEvent extends BaseEvent {
  type: 'MESSAGES_SNAPSHOT';
  messages: Message[];
}

export interface RawEvent extends BaseEvent {
  type: 'RAW';
  event: string;
  data: unknown;
}

export interface CustomEvent extends BaseEvent {
  type: 'CUSTOM';
  name: string;
  value: unknown;
}

// ─── Discriminated Union ─────────────────────────────────────────────────────

export type AGUIEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  | RawEvent
  | CustomEvent;

// ─── Event Handler ───────────────────────────────────────────────────────────

export type EventHandler<T extends AGUIEvent = AGUIEvent> = (event: T) => void | Promise<void>;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SecurityConfig {
  /** Strip HTML tags and dangerous URIs from user input. Default: true */
  sanitizeInput?: boolean;
  /** CSRF token or factory function */
  csrfToken?: string | (() => string);
  /** Maximum allowed message length in characters. Default: 8000 */
  maxMessageLength?: number;
  /** Allowed origins for origin validation */
  allowedOrigins?: string[];
  /** Sliding-window rate limiting */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface RetryConfig {
  /** Maximum number of reconnect attempts. Default: 5 */
  maxAttempts: number;
  /** Base delay in ms before first retry. Default: 1000 */
  baseDelayMs: number;
  /** Exponential backoff multiplier. Default: 2 */
  backoffMultiplier: number;
  /** Maximum delay in ms between retries. Default: 30000 */
  maxDelayMs: number;
  /** Random jitter factor (0–1). Default: 0.2 */
  jitter: number;
}

export interface EventMiddleware {
  /** Event type to intercept, or '*' for all events */
  eventType: EventTypeName | '*';
  /**
   * Called before the event is dispatched to state.
   * Return `false` to cancel the event.
   */
  before?: (event: AGUIEvent) => boolean | void | Promise<boolean | void>;
  /** Called after the event has been dispatched to state */
  after?: (event: AGUIEvent) => void | Promise<void>;
}

// ─── Context Value ───────────────────────────────────────────────────────────

export interface AGUIContextValue {
  /** Whether the SSE connection is currently open */
  isConnected: boolean;
  /** Whether an agent run is in progress */
  isRunning: boolean;
  /** Last connection or run error */
  error: Error | null;
  /** Assembled message history */
  messages: Message[];
  /** Raw event history (capped by maxEventHistory) */
  events: AGUIEvent[];
  /** Current run metadata */
  currentRun: RunState | null;
  /** Arbitrary agent state (from STATE_SNAPSHOT / STATE_DELTA) */
  agentState: Record<string, unknown>;
  /** Send a user message to the agent endpoint */
  sendMessage: (content: string, metadata?: Record<string, unknown>) => Promise<void>;
  /** Abort the current SSE connection */
  stopRun: () => void;
  /** Clear message + event history */
  clearHistory: () => void;
  /** Subscribe to a specific event type (or all events with '*') */
  on: <T extends AGUIEvent>(eventType: T['type'] | '*', handler: EventHandler<T>) => () => void;
  /** Emit a CUSTOM event */
  emit: (name: string, value: unknown) => void;
}

// ─── Provider Props ───────────────────────────────────────────────────────────

export interface AGUIProviderProps {
  /** AG-UI compatible SSE endpoint URL (required) */
  endpoint: string;
  /** Additional HTTP request headers */
  headers?: Record<string, string>;
  /** React children */
  children: React.ReactNode;
  /** Debounce interval for TEXT_MESSAGE_CONTENT re-renders in ms. Default: 16 */
  debounceMs?: number;
  /** Maximum number of events retained in history. Default: 500 */
  maxEventHistory?: number;
  /** Security configuration */
  security?: SecurityConfig;
  /** Retry / reconnection configuration */
  retryConfig?: Partial<RetryConfig>;
  /** Event middleware pipeline */
  middleware?: EventMiddleware[];
  /** Custom event handlers keyed by event name */
  customEventHandlers?: Record<string, EventHandler<CustomEvent>>;

  // ── Lifecycle handlers ──────────────────────────────────────────────────
  onRunStarted?: EventHandler<RunStartedEvent>;
  onRunFinished?: EventHandler<RunFinishedEvent>;
  onRunError?: EventHandler<RunErrorEvent>;
  onStepStarted?: EventHandler<StepStartedEvent>;
  onStepFinished?: EventHandler<StepFinishedEvent>;
  onTextMessageStart?: EventHandler<TextMessageStartEvent>;
  onTextMessageContent?: EventHandler<TextMessageContentEvent>;
  onTextMessageEnd?: EventHandler<TextMessageEndEvent>;
  onToolCallStart?: EventHandler<ToolCallStartEvent>;
  onToolCallArgs?: EventHandler<ToolCallArgsEvent>;
  onToolCallEnd?: EventHandler<ToolCallEndEvent>;
  onToolCallResult?: EventHandler<ToolCallResultEvent>;
  onStateSnapshot?: EventHandler<StateSnapshotEvent>;
  onStateDelta?: EventHandler<StateDeltaEvent>;
  onMessagesSnapshot?: EventHandler<MessagesSnapshotEvent>;
  onRaw?: EventHandler<RawEvent>;
  onCustom?: EventHandler<CustomEvent>;
}
