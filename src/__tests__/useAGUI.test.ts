import { renderHook } from '@testing-library/react';
import { useAGUI } from '../hooks/useAGUI';

describe('useAGUI', () => {
  it('throws a descriptive error when called outside <AGUIProvider>', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAGUI())).toThrow(
      '[useAGUI] Must be used inside <AGUIProvider>',
    );
    consoleSpy.mockRestore();
  });
});
