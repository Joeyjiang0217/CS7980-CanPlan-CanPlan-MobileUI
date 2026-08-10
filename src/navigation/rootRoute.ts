import { startingPageRouteName, type StartingPage } from '../features/settings/interfaceSettings';
import type { UserRole } from '../shared/api/canplanTypes';

/**
 * The root screen a session belongs on: caregivers get their own dashboard,
 * everyone else gets Home (or their Simple Mode starting page).
 *
 * Shared by the navigator's `initialRouteName` and Settings' back handler so
 * the two can't drift. They did once — Settings computed the root without the
 * role check, so leaving Settings reset a caregiver onto the primary user's
 * Home instead of popping back to CaregiverHome.
 */
export function rootRouteName({
  role,
  simpleMode,
  startingPage,
}: {
  role: UserRole | undefined;
  simpleMode: boolean;
  startingPage: StartingPage;
}): 'CaregiverHome' | 'Home' | 'Calendar' | 'AllTasks' | 'Categories' {
  if (role === 'SUPPORT_PERSON') {
    return 'CaregiverHome';
  }
  return simpleMode ? startingPageRouteName(startingPage) : 'Home';
}
