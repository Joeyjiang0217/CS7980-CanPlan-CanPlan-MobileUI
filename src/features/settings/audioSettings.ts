/**
 * Audio & Speech settings, persisted locally (same pattern as the interface
 * settings and the notification alert preference: module snapshot +
 * AsyncStorage + useSyncExternalStore).
 *
 * These were previously component state on the settings screen, so a choice
 * only lived until the user navigated away.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface AudioSettings {
  /** Read a step aloud as soon as its page settles in the step player. */
  autoPlayStepSounds: boolean;
  /** Speech speed slider, 0–100. */
  speechSpeedPercent: number;
}

export const AUDIO_SETTINGS_DEFAULTS: AudioSettings = {
  // Off by default: speech starting unprompted would startle someone in
  // company, so it stays opt-in.
  autoPlayStepSounds: false,
  speechSpeedPercent: 50,
};

/**
 * Text-to-speech rate bounds. The slider's default is 50, so 50% has to mean
 * normal speed — the mapping is linear and symmetric about 1.0. Below ~0.5 the
 * synthesiser slurs; above ~1.5 it outpaces the readers this app is for.
 *
 * Recorded audio is deliberately left alone: speeding a real voice shifts its
 * pitch, which makes it harder to follow rather than easier.
 */
export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 1.5;

export function speechRateFor(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return SPEECH_RATE_MIN + (SPEECH_RATE_MAX - SPEECH_RATE_MIN) * (clamped / 100);
}

const STORAGE_KEY = 'canplan.settings.audio';

let snapshot: AudioSettings = AUDIO_SETTINGS_DEFAULTS;
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
function sanitize(stored: unknown): AudioSettings {
  const result = { ...AUDIO_SETTINGS_DEFAULTS };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return result;
  }
  const raw = stored as Record<string, unknown>;
  if (typeof raw.autoPlayStepSounds === 'boolean') {
    result.autoPlayStepSounds = raw.autoPlayStepSounds;
  }
  if (typeof raw.speechSpeedPercent === 'number' && Number.isFinite(raw.speechSpeedPercent)) {
    result.speechSpeedPercent = Math.min(100, Math.max(0, raw.speechSpeedPercent));
  }
  return result;
}

// Hydrate once at module load; until it resolves the defaults apply.
void AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored) {
      snapshot = sanitize(JSON.parse(stored));
      emit();
    }
  })
  .catch(() => {
    // Unreadable storage falls back to the defaults.
  });

// The slider fires per drag tick, so batch disk writes; the in-memory snapshot
// (what the UI reads) always updates immediately.
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
export function updateAudioSettings(patch: Partial<AudioSettings>): void {
  snapshot = { ...snapshot, ...patch };
  emit();
  schedulePersist();
}

/** Subscribe to the current audio settings. */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/** Non-hook read for call sites outside React (playback helpers). */
export function getAudioSettings(): AudioSettings {
  return snapshot;
}
