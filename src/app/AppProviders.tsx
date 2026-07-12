import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { registerAmplifyAuth } from '../features/auth';
import { persistQueryCache, restoreQueryCache } from '../shared/query/persist';
import { queryClient } from '../shared/query/queryClient';
import { SessionProvider } from './SessionContext';

// Configure Amplify and register the Cognito-backed auth token provider once,
// when this module is first loaded. No-op (with a clear later error) if the
// Cognito env vars are absent.
registerAmplifyAuth();

type AppProvidersProps = {
  children: ReactNode;
};

/**
 * Restores the persisted query cache before rendering children (so a restart
 * shows cached data instead of empty screens), then keeps persisting changes.
 */
function PersistGate({ children }: { children: ReactNode }) {
  const [restored, setRestored] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    void restoreQueryCache(queryClient).finally(() => {
      if (!mounted) {
        return;
      }
      unsubscribeRef.current = persistQueryCache(queryClient);
      setRestored(true);
    });
    return () => {
      mounted = false;
      unsubscribeRef.current?.();
    };
  }, []);

  // Brief null until the (fast) AsyncStorage read completes — the app already
  // shows its own splash while auth/profile load right after this.
  return restored ? <>{children}</> : null;
}

/**
 * Wraps the app in cross-cutting providers: TanStack Query for server state
 * (with disk persistence), SessionProvider for guest-mode tracking.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <PersistGate>
        <SessionProvider>{children}</SessionProvider>
      </PersistGate>
    </QueryClientProvider>
  );
}
