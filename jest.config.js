/**
 * Unit tests for the app's pure logic — the branch-heavy functions behind the
 * calendar, the step runner and the settings store, extracted so they can be
 * exercised without a simulator.
 *
 * `jest-expo` brings babel-preset-expo, so TypeScript and the app's own import
 * paths work with no extra transform config. Only `*.test.ts` is collected:
 * component rendering is deliberately out of scope (mocking expo-audio,
 * expo-notifications and Amplify costs more than it catches).
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
