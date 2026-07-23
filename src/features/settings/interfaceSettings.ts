/**
 * Interface settings, persisted locally (same pattern as the notification
 * alert preference: module snapshot + AsyncStorage + useSyncExternalStore).
 *
 * Local-only by design for now — these are UI preferences; migrating them to
 * the backend profile is a later, whole-settings decision. Values are stored
 * as one JSON blob under a single key and merged over the defaults on load,
 * so adding a new setting later is backward-compatible.
 *
 * NOTE: `simpleMode` here is the settings-screen toggle state only. The
 * behavior the app currently obeys still comes from the backend profile's
 * accessibilitySettings (useSimpleMode) — wiring this toggle to that profile
 * field is part of the later behavior pass.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type StartingPage = 'CALENDAR' | 'ALL_TASKS' | 'CATEGORIES';

export interface InterfaceSettings {
  startingPage: StartingPage;
  simpleMode: boolean;
  allowChangingDate: boolean;
  useCategories: boolean;
  showOverdue: boolean;
  onlyToday: boolean;
  /** Task icon size slider, 0–100. */
  iconSizePercent: number;
}

export const INTERFACE_SETTINGS_DEFAULTS: InterfaceSettings = {
  startingPage: 'CALENDAR',
  simpleMode: false,
  allowChangingDate: true,
  useCategories: true,
  showOverdue: false,
  onlyToday: false,
  iconSizePercent: 50,
};

const STORAGE_KEY = 'canplan.settings.interface';
const STARTING_PAGES: readonly StartingPage[] = ['CALENDAR', 'ALL_TASKS', 'CATEGORIES'];

let snapshot: InterfaceSettings = INTERFACE_SETTINGS_DEFAULTS;
let hydrated = false;
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

/** Merge a stored blob over the defaults, dropping unknown/mistyped values. */
function sanitize(stored: unknown): InterfaceSettings {
  const result = { ...INTERFACE_SETTINGS_DEFAULTS };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return result;
  }
  const raw = stored as Record<string, unknown>;
  if (STARTING_PAGES.includes(raw.startingPage as StartingPage)) {
    result.startingPage = raw.startingPage as StartingPage;
  }
  for (const key of [
    'simpleMode',
    'allowChangingDate',
    'useCategories',
    'showOverdue',
    'onlyToday',
  ] as const) {
    if (typeof raw[key] === 'boolean') {
      result[key] = raw[key];
    }
  }
  if (
    typeof raw.iconSizePercent === 'number' &&
    Number.isFinite(raw.iconSizePercent)
  ) {
    result.iconSizePercent = Math.min(100, Math.max(0, raw.iconSizePercent));
  }
  // Coherence: Categories can't be the starting page while categories are
  // disabled (the settings screen enforces this too; this guards old blobs).
  if (!result.useCategories && result.startingPage === 'CATEGORIES') {
    result.startingPage = INTERFACE_SETTINGS_DEFAULTS.startingPage;
  }
  return result;
}

// Hydrate once at module load; until it resolves the defaults apply.
void AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored) {
      snapshot = sanitize(JSON.parse(stored));
    }
  })
  .catch(() => {
    // Unreadable storage falls back to the defaults.
  })
  .finally(() => {
    hydrated = true;
    emit();
  });

// The slider fires per drag tick, so batch disk writes; the in-memory
// snapshot (what the UI reads) always updates immediately.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {
      // Worst case the settings reset to their last saved state on relaunch.
    });
  }, 300);
}

/** Apply and persist a partial update. */
export function updateInterfaceSettings(patch: Partial<InterfaceSettings>): void {
  snapshot = { ...snapshot, ...patch };
  emit();
  schedulePersist();
}

/** Subscribe to the current interface settings. */
export function useInterfaceSettings(): InterfaceSettings {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/** Non-hook read for behavior call sites (navigation, calendar, etc.). */
export function getInterfaceSettings(): InterfaceSettings {
  return snapshot;
}

/**
 * Whether the persisted values have been loaded. The app's root waits on this
 * before picking the initial route, so a Simple Mode start page doesn't flash
 * Home on relaunch. AsyncStorage resolves in milliseconds — the splash covers it.
 */
export function useInterfaceSettingsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => hydrated,
  );
}

/** The main-stack route a Starting Page choice boots into. */
export function startingPageRouteName(
  page: StartingPage,
): 'Calendar' | 'AllTasks' | 'Categories' {
  switch (page) {
    case 'CALENDAR':
      return 'Calendar';
    case 'CATEGORIES':
      return 'Categories';
    default:
      return 'AllTasks';
  }
}
