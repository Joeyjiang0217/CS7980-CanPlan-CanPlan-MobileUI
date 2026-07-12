/**
 * Root navigation ref for navigating outside the React tree (e.g. from the
 * notification-tap listener). Attached to the NavigationContainer in App.tsx.
 */
import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

import type { MainStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<MainStackParamList>();

/** Navigate iff the container is ready AND the route exists in the active stack. */
export function navigateIfAvailable<Name extends keyof MainStackParamList>(
  name: Name,
  params?: MainStackParamList[Name],
): void {
  if (!navigationRef.isReady()) {
    return;
  }
  const state = navigationRef.getRootState();
  if (state?.routeNames?.includes(name)) {
    navigationRef.dispatch(CommonActions.navigate({ name, params }));
  }
}
