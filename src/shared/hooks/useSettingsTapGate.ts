/**
 * The Simple Mode settings gate: the gear only opens Settings on the third
 * tap within a short window, so users who tap around can't wander into
 * Settings by accident. Shared by the simple-mode root screens (All Tasks,
 * Calendar, Categories) so the interaction and hint copy stay identical.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const TAPS_TO_OPEN = 3;
const TAP_RESET_TIMEOUT_MS = 1500;

export function useSettingsTapGate(openSettings: () => void): {
  /** Wire to the gear's onPress. */
  handleSettingsTap: () => void;
  /** Progress copy ("Tap 2 times for settings"), or null when idle. */
  settingsHint: string | null;
} {
  const [tapCount, setTapCount] = useState(0);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    setTapCount(0);
  }, []);

  useEffect(() => reset, [reset]);

  const handleSettingsTap = useCallback(() => {
    const nextTapCount = tapCount + 1;
    if (nextTapCount >= TAPS_TO_OPEN) {
      reset();
      openSettings();
      return;
    }
    setTapCount(nextTapCount);
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      resetTimeoutRef.current = null;
      setTapCount(0);
    }, TAP_RESET_TIMEOUT_MS);
  }, [openSettings, reset, tapCount]);

  const remaining = TAPS_TO_OPEN - tapCount;
  const settingsHint =
    tapCount > 0
      ? `Tap ${remaining} ${remaining === 1 ? 'time' : 'times'} for settings`
      : null;

  return { handleSettingsTap, settingsHint };
}
