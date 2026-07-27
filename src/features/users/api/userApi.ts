/**
 * Users feature API facade.
 *
 * Adds user-scoped convenience functions around the schema-complete shared
 * client. The generic client accepts explicit ids for supporter/admin flows;
 * these helpers obtain the current Cognito `sub` for "my profile" calls.
 */

import { getCurrentUserId } from '../../../shared/api/authTokenProvider';
import { canPlanApi } from '../../../shared/api/canplanApi';
import type {
  CreateMyUserProfileInput,
  PageInput,
  SelectPrimaryUserInput,
  UnselectPrimaryUserInput,
  UpdateMyUserProfileInput,
  UserProfile,
} from '../../../shared/api/canplanTypes';

export { canPlanApi as usersApi };
export type { CreateMyUserProfileInput, UpdateMyUserProfileInput };

/**
 * Returns the profile of the currently signed-in user, or `null` if no profile
 * has been created yet (callers use null to trigger the onboarding flow —
 * see docs/API.md "Profile bootstrap").
 */
export async function getMyProfile(): Promise<UserProfile | null> {
  const userId = await getCurrentUserId();
  return canPlanApi.getUserProfile(userId);
}

/**
 * Creates the signed-in caller's own profile. `userId`, `email`, and `role`
 * are derived server-side from the Cognito session and **must not** be sent
 * from the client (see docs/API.md).
 */
export async function createMyProfile(
  input: CreateMyUserProfileInput,
): Promise<UserProfile> {
  const profile = await canPlanApi.createUserProfile(input);
  if (!profile) {
    throw new Error('createUserProfile returned no profile.');
  }
  return profile;
}

/**
 * Updates the signed-in caller's own profile (partial update). The owner is
 * always the Cognito identity — there is no `userId` to pass.
 */
export function updateMyProfile(
  input: UpdateMyUserProfileInput,
): Promise<UserProfile> {
  return canPlanApi.updateMyUserProfile(input);
}

export function getUserProfile(userId: string) {
  return canPlanApi.getUserProfile(userId);
}

export function listMyOrganizationUsers(page?: PageInput) {
  return canPlanApi.listMyOrganizationUsers(page);
}

export function listMySupportList(page?: PageInput) {
  return canPlanApi.listMySupportList(page);
}

export function selectPrimaryUser(input: SelectPrimaryUserInput) {
  return canPlanApi.selectPrimaryUser(input);
}

export function unselectPrimaryUser(input: UnselectPrimaryUserInput) {
  return canPlanApi.unselectPrimaryUser(input);
}

export function listAllUsers(page?: PageInput) {
  return canPlanApi.listAllUsers(page);
}
