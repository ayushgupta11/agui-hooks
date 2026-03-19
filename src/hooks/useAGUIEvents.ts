import { useAGUI } from './useAGUI';
import type { AGUIEvent, Message, RunState } from '../types';

/**
 * Returns the assembled message history.
 *
 * @example
 * ```tsx
 * function MessageList() {
 *   const messages = useAGUIMessages();
 *   return <ul>{messages.map(m => <li key={m.id}>{m.content}</li>)}</ul>;
 * }
 * ```
 */
export function useAGUIMessages(): Message[] {
  return useAGUI().messages;
}

/**
 * Returns current run status and metadata.
 *
 * @example
 * ```tsx
 * function RunStatus() {
 *   const { isRunning, currentRun, error } = useAGUIRunState();
 *   if (isRunning) return <p>Running: {currentRun?.runId}</p>;
 *   if (error) return <p>Error: {error.message}</p>;
 *   return <p>Idle</p>;
 * }
 * ```
 */
export function useAGUIRunState(): {
  isRunning: boolean;
  currentRun: RunState | null;
  error: Error | null;
} {
  const { isRunning, currentRun, error } = useAGUI();
  return { isRunning, currentRun, error };
}

/**
 * Returns the agent's arbitrary key-value state, updated via STATE_SNAPSHOT
 * and STATE_DELTA events.
 *
 * @example
 * ```tsx
 * function AgentDebug() {
 *   const state = useAGUIAgentState();
 *   return <pre>{JSON.stringify(state, null, 2)}</pre>;
 * }
 * ```
 */
export function useAGUIAgentState(): Record<string, unknown> {
  return useAGUI().agentState;
}

/**
 * Returns the raw event history (capped by `maxEventHistory`).
 *
 * @example
 * ```tsx
 * function EventLog() {
 *   const events = useAGUIEventHistory();
 *   return <ul>{events.map((e, i) => <li key={i}>{e.type}</li>)}</ul>;
 * }
 * ```
 */
export function useAGUIEventHistory(): AGUIEvent[] {
  return useAGUI().events;
}

/**
 * Returns the stable `sendMessage` function for sending user messages.
 *
 * @example
 * ```tsx
 * function ChatInput() {
 *   const sendMessage = useAGUISendMessage();
 *   return <button onClick={() => sendMessage('Hello!')}>Send</button>;
 * }
 * ```
 */
export function useAGUISendMessage(): AGUIContextValue['sendMessage'] {
  return useAGUI().sendMessage;
}

// Re-export type to avoid callers having to import from types
import type { AGUIContextValue } from '../types';
