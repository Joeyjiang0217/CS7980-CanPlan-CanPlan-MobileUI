/**
 * The user's task-reminder timing preference, persisted locally.
 *
 * Local-only by design (phase 1): reminders are scheduled on-device, so the
 * preference lives in AsyncStorage rather than the backend profile. Defaults
 * to NONE — no reminders, and no permission prompt, until the user opts in
 * from Settings → Notifications.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type NotificationAlertPreference =
  | 'NONE'
  | 'FIFTEEN_MINUTES_BEFORE'
  | 'AT_TIME';

const STORAGE_KEY = 'canplan.notifications.alertPreference';

const VALID_VALUES: readonly NotificationAlertPreference[] = [
  'NONE',
  'FIFTEEN_MINUTES_BEFORE',
  'AT_TIME',
];

let snapshot: NotificationAlertPreference = 'NONE';
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Resolves once the persisted value has been loaded into the snapshot. */
const hydrated: Promise<void> = AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (VALID_VALUES.includes(stored as NotificationAlertPreference)) {
      snapshot = stored as NotificationAlertPreference;
      emit();
    }
  })
  .catch(() => {
    // Unreadable storage falls back to the NONE default.
  });

/** The persisted preference; awaits hydration so early callers see the real value. */
export async function getNotificationAlertPreference(): Promise<NotificationAlertPreference> {
  await hydrated;
  return snapshot;
}

/** Persists a new preference. Callers should resync scheduled reminders after. */
export async function setNotificationAlertPreference(
  value: NotificationAlertPreference,
): Promise<void> {
  snapshot = value;
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value);
  } catch {
    // The in-memory value still applies this session; worst case the
    // preference resets to NONE on next launch.
  }
}

/** Subscribe to the preference for UI (settings screen radio state). */
export function useNotificationAlertPreference(): NotificationAlertPreference {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
