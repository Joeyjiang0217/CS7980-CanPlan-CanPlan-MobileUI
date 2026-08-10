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
