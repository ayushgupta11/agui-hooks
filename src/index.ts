// ─── Components ───────────────────────────────────────────────────────────────
export { AGUIProvider } from './provider/AGUIProvider';

// ─── Primary Hook ─────────────────────────────────────────────────────────────
export { useAGUI } from './hooks/useAGUI';

// ─── Granular Hooks ───────────────────────────────────────────────────────────
export {
  useAGUIMessages,
  useAGUIRunState,
  useAGUIAgentState,
  useAGUIEventHistory,
  useAGUISendMessage,
} from './hooks/useAGUIEvents';

// ─── Constants ────────────────────────────────────────────────────────────────
export { EventType } from './constants/events';

// ─── Types ────────────────────────────────────────────────────────────────────
export type { EventTypeName } from './constants/events';

export type {
  // Provider
  AGUIProviderProps,
  // Context
  AGUIContextValue,
  // Events (discriminated union + individual)
  AGUIEvent,
  BaseEvent,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  StepStartedEvent,
  StepFinishedEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  StateSnapshotEvent,
  StateDeltaEvent,
  MessagesSnapshotEvent,
  RawEvent,
  CustomEvent,
  // Event handler
  EventHandler,
  // Domain models
  Message,
  MessageRole,
  ToolCall,
  RunState,
  // Config
  SecurityConfig,
  RetryConfig,
  EventMiddleware,
} from './types';
