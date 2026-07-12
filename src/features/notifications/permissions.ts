/** OS notification-permission helpers shared by the settings screen and scheduler. */
import * as Notifications from 'expo-notifications';

function isGranted(response: Notifications.NotificationPermissionsStatus): boolean {
  return (
    response.granted ||
    response.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/** Whether the app can currently deliver notifications (no prompt shown). */
export async function hasNotificationPermission(): Promise<boolean> {
  return isGranted(await Notifications.getPermissionsAsync());
}

/**
 * Makes sure we can deliver notifications, prompting the user if the OS still
 * allows it. 'blocked' means the user must flip the switch in system settings
 * (iOS only shows its permission dialog once).
 */
export async function ensureNotificationPermission(): Promise<
  'granted' | 'denied' | 'blocked'
> {
  const current = await Notifications.getPermissionsAsync();
  if (isGranted(current)) {
    return 'granted';
  }
  if (!current.canAskAgain) {
    return 'blocked';
  }
  const requested = await Notifications.requestPermissionsAsync();
  return isGranted(requested) ? 'granted' : 'denied';
}
