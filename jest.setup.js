/**
 * AsyncStorage is a native module, so anything importing it fails under Jest.
 * The settings stores are built on it, and they are exactly the modules whose
 * pure parts (route mapping, `sanitize`'s tolerance of old stored blobs) are
 * worth testing — so use the package's own in-memory mock rather than avoiding
 * those files.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * expo-notifications registers device push listeners at import time and warns
 * about Expo Go while doing it. Nothing under test schedules a notification —
 * it arrives transitively (a hook imports the reminder scheduler) — so stub the
 * surface the app touches and keep the run's output readable.
 */
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
