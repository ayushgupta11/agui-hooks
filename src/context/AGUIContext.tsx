import { createContext } from 'react';
import type { AGUIContextValue } from '../types';

/**
 * Default is `null` so that `useAGUI()` can detect calls made outside
 * of a provider and throw a helpful error message.
 */
const AGUIContext = createContext<AGUIContextValue | null>(null);

AGUIContext.displayName = 'AGUIContext';

export { AGUIContext };
