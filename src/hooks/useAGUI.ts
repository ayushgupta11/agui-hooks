import { useContext } from 'react';
import { AGUIContext } from '../context/AGUIContext';
import type { AGUIContextValue } from '../types';

/**
 * Primary hook for consuming the AG-UI context.
 *
 * Must be called inside an `<AGUIProvider>` — throws a descriptive error
 * if called outside one.
 *
 * @example
 * ```tsx
 * function ChatInput() {
 *   const { sendMessage, isRunning } = useAGUI();
 *   return <button onClick={() => sendMessage('Hello')} disabled={isRunning}>Send</button>;
 * }
 * ```
 */
export function useAGUI(): AGUIContextValue {
  const ctx = useContext(AGUIContext);
  if (!ctx) {
    throw new Error(
      '[useAGUI] Must be used inside <AGUIProvider>. ' +
        'Wrap your component tree with <AGUIProvider endpoint="...">.',
    );
  }
  return ctx;
}
