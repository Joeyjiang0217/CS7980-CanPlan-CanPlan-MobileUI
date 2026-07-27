import { useInterfaceSettings } from '../../settings/interfaceSettings';
import type { JsonValue } from '../../../shared/api/canplanTypes';

/**
 * Reads `simpleMode` out of a profile's free-form accessibilitySettings object.
 * Kept for the future cloud-sync pass — the app's effective Simple Mode is
 * currently the LOCAL interface setting (Joe's call: all settings stay
 * device-local for now, no cloud writes).
 */
export function readSimpleMode(
  settings: JsonValue | null | undefined,
): boolean {
  return Boolean(
    settings &&
      typeof settings === 'object' &&
      !Array.isArray(settings) &&
      (settings as Record<string, JsonValue>).simpleMode === true,
  );
}

/**
 * Whether Simple Mode is enabled — driven by the locally persisted interface
 * settings (Settings → Interface), so screens branch their layout on it.
 */
export function useSimpleMode(): boolean {
  return useInterfaceSettings().simpleMode;
}
