import React from 'react';
import { renderHook } from '@testing-library/react';
import { AGUIProvider } from '../provider/AGUIProvider';
import {
  useAGUIMessages,
  useAGUIRunState,
  useAGUIAgentState,
  useAGUIEventHistory,
  useAGUISendMessage,
} from '../hooks/useAGUIEvents';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AGUIProvider endpoint="http://localhost:8000/agent">
      {children}
    </AGUIProvider>
  );
}

describe('granular hooks', () => {
  it('useAGUIMessages returns empty array initially', () => {
    const { result } = renderHook(() => useAGUIMessages(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it('useAGUIRunState returns correct initial state', () => {
    const { result } = renderHook(() => useAGUIRunState(), { wrapper });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.currentRun).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('useAGUIAgentState returns empty object initially', () => {
    const { result } = renderHook(() => useAGUIAgentState(), { wrapper });
    expect(result.current).toEqual({});
  });

  it('useAGUIEventHistory returns empty array initially', () => {
    const { result } = renderHook(() => useAGUIEventHistory(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it('useAGUISendMessage returns a function', () => {
    const { result } = renderHook(() => useAGUISendMessage(), { wrapper });
    expect(typeof result.current).toBe('function');
  });

  it('throws when used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAGUIMessages())).toThrow('[useAGUI]');
    consoleSpy.mockRestore();
  });
});
