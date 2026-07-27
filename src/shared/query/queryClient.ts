import { QueryClient } from '@tanstack/react-query';

/**
 * App-wide TanStack Query client.
 *
 * - `staleTime` of 5 min keeps fetched data fresh across navigation so
 *   re-entering a screen (e.g. the month calendar) doesn't re-hit the API.
 *   Mutations still invalidate the relevant keys, so edits show immediately.
 * - `gcTime` of 24 h keeps cached data around long enough to be worth
 *   persisting to disk (see shared/query/persist.ts) and surviving restarts.
 * - `retry: 1` retries a failed query once before surfacing the error.
 * - `refetchOnWindowFocus: false` is appropriate for React Native.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
