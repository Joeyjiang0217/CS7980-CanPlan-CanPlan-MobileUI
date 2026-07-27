/**
 * Lightweight TanStack Query persistence to AsyncStorage.
 *
 * Restores the cached queries on startup (so a restart doesn't lose data) and
 * writes the cache back, throttled, whenever it changes. Built on the core
 * `dehydrate`/`hydrate` helpers so no extra persistence package is needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

// Bump the version suffix to invalidate any incompatible persisted cache.
const STORAGE_KEY = 'canplan-rq-cache-v1';
const SAVE_THROTTLE_MS = 2000;

/** Load any persisted cache into the client. Safe to call once at startup. */
export async function restoreQueryCache(client: QueryClient): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      hydrate(client, JSON.parse(raw));
    }
  } catch {
    // Corrupt / incompatible snapshot — ignore and start fresh.
  }
}

/** Subscribe to cache changes and persist them (throttled). Returns unsubscribe. */
export function persistQueryCache(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    try {
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dehydrate(client)));
    } catch {
      // Ignore write failures (e.g. storage full) — cache is best-effort.
    }
  };

  return client.getQueryCache().subscribe(() => {
    if (timer === null) {
      timer = setTimeout(flush, SAVE_THROTTLE_MS);
    }
  });
}
