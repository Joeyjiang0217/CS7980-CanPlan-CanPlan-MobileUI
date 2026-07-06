# Design Doc — Caregiver / Support-Person Portal

**Status:** Draft for review
**Author:** (design) · **Date:** 2026-06-27
**Scope:** A second entrance into CanPlan 2.0 that lets caregivers/support persons sign up, log in, and view & manage the tasks of the patients ("users") they support — built to match the existing UI/UX prototype.

---

## 1. Background & goals

CanPlan 2.0 today is a **single-user, patient-facing** prototype. The whole app lives in [`src/app/App.tsx`](../src/app/App.tsx), navigation is a manual `screen` state machine (no router), styling is Tailwind v4 + inline styles with the established token palette, and **nothing persists** — all data resets on reload. The existing auth flow (`login` → `signup` → `verify-email` → `signup-info`, plus `forgot-password`) is UI-only, and the login screen already nods to this feature: *"Need help? Ask a support person to assist you."*

We now want a **caregiver entrance**: a parallel login/signup flow where a support person authenticates, sees the patients linked to them, and drills into each patient to view and manage their tasks, categories, and calendar.

**Goals**
- A complete caregiver **signup + login + forgot-password** flow, visually consistent with the patient auth screens.
- A **caregiver home** that lists linked patients and lets the caregiver open any one of them.
- **Reuse the existing patient screens** (All Tasks, Categories, Calendar, Task Detail, Create/Edit) for managing a selected patient, rather than rebuilding them.
- Stay faithful to the current prototype conventions: same file, same `Screen` state pattern, same component/style idioms, **mock data only** (no real backend in this iteration).

**Non-goals (this iteration)**
- Real authentication / a backend / persistence (the patient flow is also mock — we match it).
- Real-time sync, permissions/roles beyond "caregiver vs patient", invitations by email, audit logs.
- Multi-caregiver-per-patient conflict handling.

---

## 2. Design principles (inherited from the current app)

| Concern | Convention to follow |
|---|---|
| Navigation | `type Screen` union + `useState<Screen>` + conditional render in `App()`. Add new screens, don't add a router. |
| Styling | Tailwind classes + inline `style` for dynamic colors. Tokens: primary `#E8623A`, gradient `linear-gradient(135deg,#E8623A,#F07B3A)`, teal `#3DB8AD`, bg `#FEF7EE`, input bg `#F5EDE0`, text `#1C1A2E`, muted `#7A6F6A`. |
| Type | Headings/buttons **Nunito** (`font-black`), body **DM Sans** (`font-semibold`). |
| Inputs | Reuse the existing `AuthField` component (`src/app/App.tsx:1431`) — it already handles labels + password show/hide. |
| Header band | Auth screens use the orange gradient band at top with title + step subtitle. |
| Buttons | Full-width, `rounded-[1.75rem]`, gradient when enabled / `#C9BDB5` when disabled, `active:scale-[0.98]`. |
| Cards | White, `rounded-[1.75rem]`, `shadow-sm`, `border border-black/[0.06]`, category color stripe pattern. |

---

## 3. Entry-point strategy

**Decision: add a "role chooser" as the very first screen**, instead of branching inside the existing login form.

Today `App` starts at `screen: "login"`. We change the initial screen to a new `"welcome"` (role chooser) with two big choices:

- **"I use CanPlan"** → existing patient `login` flow (unchanged).
- **"I'm a caregiver / support person"** → new `caregiver-login` flow.

Rationale: it keeps the two audiences cleanly separated, matches the accessibility-first tone of the app (large, unambiguous buttons), and avoids overloading the patient login screen — which is intentionally simple for the patient. A small "Back" affordance returns to the chooser from either side.

```
                 ┌─────────────────┐
                 │   welcome        │  ← new initial screen
                 │  (role chooser)  │
                 └───┬──────────┬───┘
        patient ◄────┘          └────► caregiver
   login / signup /              caregiver-login /
   verify / info /               caregiver-signup /
   forgot (existing)             caregiver-forgot (new)
                                       │
                                       ▼
                                 caregiver-home
                                 (linked patients list)
                                       │ select patient
                                       ▼
                          existing patient screens, scoped
                          to that patient (all-tasks,
                          categories, calendar, task-detail,
                          create, …)
```

---

## 4. New screens

All added to the `Screen` union and rendered in `App()` alongside the current screens.

1. **`welcome`** — role chooser (see §3). Logo band + two large cards.
2. **`caregiver-login`** — mirrors `LoginScreen`. Email + password, "Forgot password?", "Create Account" → `caregiver-signup`, plus a back link to `welcome`. Header subtitle distinguishes it: *"Caregiver sign in"*.
3. **`caregiver-signup`** — mirrors the patient signup as a **3-step** flow (full parity with the patient flow):
   - Step 1 of 3 — login details (email, password, confirm). Reuse the `SignUpScreen` layout.
   - Step 2 of 3 — email verification (6-digit code). Clone `VerifyEmailScreen`.
   - Step 3 of 3 — caregiver profile (first name, last name, optional "relationship to the person you support" e.g. *Parent / Partner / Support worker*).
4. **`caregiver-forgot`** — clone of `ForgotPasswordScreen`.
5. **`caregiver-home`** — the caregiver dashboard. Greeting ("Hi {caregiverName}!"), a list of **linked patient cards** (pre-seeded), and an "+ Add a person" affordance. Each card shows patient name/avatar, a quick stat (e.g. "3 tasks today · 1 overdue"), and opens that patient.
6. **`caregiver-add-patient`** — a screen to "link" a patient by a code/email. For the prototype this validates the input shape and appends a mock patient to the list. Shipped alongside the pre-seeded patients so both the populated and the linking flows are demoable.

> **Reuse, don't rebuild:** once a caregiver selects a patient, we route into the **existing** `all-tasks` / `categories` / `calendar` / `task-detail` / `create` screens. The only change those screens need is awareness of an optional "managing patient" banner and a Back target that returns to `caregiver-home` instead of the patient `home`.

---

## 5. Data model (mock)

Add lightweight types near the existing `Task`/`Category` interfaces. Today tasks live in one flat `tasks` array. To support multiple patients we introduce a `Patient` and key task ownership by patient.

```ts
interface Patient {
  id: string;
  firstName: string;
  lastName?: string;
  avatarColor: string;      // reuse the category color palette for the avatar circle
  // tasks/categories belong to the patient:
}

interface Caregiver {
  id: string;
  firstName: string;
  lastName?: string;
  relationship?: string;    // "Parent" | "Support worker" | ...
  patientIds: string[];     // patients this caregiver can manage
}

// App-level session
type SessionRole = "patient" | "caregiver" | null;
```

**Task ownership.** Minimal-change option for the prototype: keep the current single `tasks` array as "Alex's tasks", and give each mock patient its own seeded `tasks`/`categories`. Two viable shapes:

- **(Recommended) `patients: Patient[]` + per-patient task maps** — `Record<patientId, Task[]>` and `Record<patientId, Category[]>`. When a caregiver opens a patient, we set `activePatientId` and the existing screens read/write that patient's slice. The patient's own login simply uses a fixed `activePatientId` ("self").
- *(Lighter, hackier)* add `patientId` to `Task` and filter — more churn across every screen. Not recommended.

This keeps the existing patient experience untouched (it's just "the active patient is me") while letting a caregiver switch the active patient.

---

## 6. State & navigation changes in `App()`

- `screen` initial value: `"login"` → `"welcome"`.
- New state: `role: SessionRole`, `caregiver: Caregiver | null`, `patients: Patient[]`, `activePatientId: string | null`, and the per-patient task/category maps described above.
- `handleLogin` stays for the patient; add `handleCaregiverLogin` that sets `role="caregiver"` and routes to `caregiver-home`.
- Selecting a patient: `openPatient(id)` sets `activePatientId` and routes to that patient's start screen (respecting `simpleMode`/`startingPage` if we want, or just `all-tasks`).
- **Back-target logic:** the existing screens compute Back as `simpleMode ? startingPage : "home"`. Extend to: `role === "caregiver" ? "caregiver-home" : (simpleMode ? startingPage : "home")`. This is the main touch-point in existing screens.
- **"Managing" banner:** when `role === "caregiver" && activePatientId`, show a thin banner ("Managing {patientName} · Done") at the top of the reused screens so the caregiver always knows whose data they're editing and can exit back to the dashboard.

---

## 7. Screen-by-screen UX notes

- **welcome** — orange gradient logo band ("CanPlan 2.0 / Your daily task guide"), then two stacked cards with icon + title + one-line description. Big tap targets, high contrast.
- **caregiver-login / signup / forgot** — identical structure and components to the patient versions; only the header subtitle copy and the navigation handlers differ. Reuse `AuthField` verbatim.
- **caregiver-home** — greeting + date (like `HomeScreen`), a vertical list of patient cards (white, rounded, color avatar, name, quick stat), an "+ Add a person" outline button at the bottom, and Settings / Sign out in the header. Sign out → `welcome`.
- **managing a patient** — reuse existing screens with the banner + adjusted Back. Caregivers get the **full management surface** — create, edit, delete, reorder, and complete tasks and categories — independent of the patient's `simpleMode` (which only governs the patient's own simplified view).

---

## 8. Implementation plan (incremental, low-risk)

1. **Types & seed data** — add `Patient`/`Caregiver`/`SessionRole`, seed 2–3 mock patients each with their own tasks/categories. (No UI yet.)
2. **`welcome` screen + reroute** — add the screen, flip the initial `screen` to `welcome`, wire both branches. Patient flow unchanged.
3. **Caregiver auth screens** — `caregiver-login`, `caregiver-signup` (3 steps: details → verify → profile), `caregiver-forgot`, cloning the patient components with new copy/handlers.
4. **`caregiver-home`** — patient list + open/add handlers + sign out.
5. **Scope existing screens to `activePatientId`** — switch task/category reads & writes to the active patient's slice; add the "Managing" banner and caregiver-aware Back targets.
6. **`caregiver-add-patient`** — mock linking by code/email, appended to the patient list.
7. **Polish** — empty states, disabled-button states, copy review for accessibility tone.

Each step is independently runnable in the prototype.

---

## 9. Decisions (resolved 2026-06-27)

1. **Entrance shape** — ✅ Role chooser as the first screen (`welcome`).
2. **Email verification for caregivers** — ✅ **Include** the 6-digit step. Caregiver signup is a 3-step flow with full parity.
3. **Patient ↔ caregiver linking** — ✅ **Both**: ship pre-seeded linked patients *and* a mock "Add a person" (`caregiver-add-patient`) flow.
4. **Caregiver permissions** — ✅ **Full management** (create / edit / delete / reorder / complete).
5. **Patient simple mode interaction** — ✅ Caregiver always sees the full management view regardless of the patient's `simpleMode`.

### Still open
- **Persistence** — keep everything mock/ephemeral to match the current prototype (recommended), or wire `localStorage` so sessions/added patients survive reload? *Defaulting to ephemeral unless told otherwise.*
