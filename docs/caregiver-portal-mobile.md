# Caregiver Portal — Mobile Implementation Status & Backend Request

**Repo:** CanPlan-MobileUI · **Branch:** `caregiver-mobile-portal`
**Status:** Read-only caregiver portal built against the real backend. Live-data
drill-in is blocked on a backend change (see §3).

This is the mobile translation of the web prototype's caregiver design
(`uiux/docs/caregiver-portal-design.md`). The web plan targets a mock,
state-machine prototype; the mobile app is React Navigation + TanStack Query +
real AppSync/Cognito, so the *intent* was ported, not the plan.

---

## 1. What's built (real backend, no mock data)

| Piece | Where | Notes |
|---|---|---|
| Role-driven entrance | `App.tsx` (`RootStack`) | When `profile.role === 'SUPPORT_PERSON'`, the Main stack's initial route is `CaregiverHome` instead of `Home`/`AllTasks`. No mock "role chooser" — keyed off the real Cognito-derived role. |
| `CaregiverHome` | `src/screens/caregiver/CaregiverHomeScreen.tsx` | Greeting + list of linked primary users via the existing `useLinkedPrimaryUsers(supporterId)` (`listPrimaryUsersBySupporter` → resolve profiles). Loading/error/empty/retry states. |
| `PatientOverview` | `src/screens/caregiver/PatientOverviewScreen.tsx` | Drill-in shell: "Managing {name}" banner + back to dashboard. **Progress reports** section is live (existing `Reports`/`ReportView`). Tasks/Categories/Calendar shown as disabled "Soon" cards (blocked — see §3). |
| Shared avatar helpers | `src/screens/caregiver/patientAvatar.ts` | Deterministic avatar tint + initials. |

Patient (`PRIMARY_USER`) experience is unchanged. `tsc --noEmit` is clean.

**Flow:** sign in as `SUPPORT_PERSON` → CaregiverHome (linked patients) → tap a
patient → PatientOverview → Progress reports → Reports/ReportView.

---

## 2. What's needed to test (for the backend team)

The portal needs, in the sandbox/dev environment:

1. **A `SUPPORT_PERSON` test login.** Normal signup auto-lands in `PrimaryUser`.
   Promote a user via `setUserBaseRole` (SystemAdmin) or the Cognito console —
   remove `PrimaryUser`, add `SupportPerson` (role is mutually exclusive), then
   the user must re-login and have a `UserProfile`.
2. **1–2 `PRIMARY_USER` test logins**, with their `userId` (Cognito `sub`).
3. **ACTIVE `SupportLink`s** from the supporter to those primary users. Any
   signed-in user can call `createSupportLink` today, so we can create these
   ourselves given the primary users' subs — or you can seed them.
4. The `EXPO_PUBLIC_GRAPHQL_URL` + `EXPO_PUBLIC_COGNITO_*` values for
   `.env.local`.

---

## 3. Backend request — supporter-scoped reads (unblocks the rest of the design)

**Problem.** Task/Category/Calendar reads are strictly owner-scoped
(`src/shared/authz.ts`: caller `sub` must equal the resource `ownerId`; a
foreign owner is rejected). So a caregiver cannot read a linked patient's live
tasks, categories, or calendar — only their **reports** (a purpose-built
supporter-facing path). This blocks the design's core "drill into a patient and
see their day" surface.

**Request.** Allow a supporter to **read** a primary user's data when an
**ACTIVE `SupportLink`** exists between them. Concretely:

- **Authorization:** in `authz.ts`, permit a read when
  `callerSub === ownerId` **OR** an `ACTIVE SupportLink(supporterId=callerSub,
  primaryUserId=ownerId)` exists. The `SupportLink.permissions` (AWSJSON) field
  is the natural place to scope this (e.g. `{ "read": true }`) if finer control
  is wanted later.
- **API surface:** the currently self-scoped reads derive the owner from the
  caller and take no `userId`, so a supporter has no way to name the target.
  Options (either works for the mobile client):
  - add an optional `userId`/`ownerId` arg to `listTaskInstances`,
    `getTaskInstanceViews`, `listMyCategories`, and reuse `listTasksByOwner`
    with the target `ownerId`; the resolver authorizes via the rule above; or
  - add explicit supporter-scoped queries mirroring the report pattern.
- **Scope for now:** **read-only.** Write/management delegation (create/edit/
  delete/reorder on a patient's behalf) is a separate, later request.

**Already available (no change needed):** `listPrimaryUsersBySupporter`,
`getUserProfile`, and the reports path (`listReports`, `generateReport`,
report documents) already work for a supporter against a linked primary user.

**Mobile side, once delivered:** swap the three "Soon" cards in
`PatientOverviewScreen.tsx` for navigation into the existing task/category/
calendar screens, parameterized by the selected patient's `userId`.
