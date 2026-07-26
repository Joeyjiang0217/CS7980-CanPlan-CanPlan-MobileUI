/**
 * Navigation param lists.
 *
 * Three stacks live in the app — Auth, Onboarding, Main — swapped at the
 * root (App.tsx) based on session state, not nested.
 */

export type AuthStackParamList = {
  SignIn: undefined;
  /**
   * Carries the password through to VerifyEmail so we can auto-sign-in after
   * the user confirms their code (no second password prompt). Lives in
   * navigation params only — not persisted.
   */
  CreateAccount: undefined;
  VerifyEmail: { email: string; password: string };

  /**
   * Forgot-password flow (2 steps), matching Cognito's two backend calls:
   *   Step 1 — ForgotPassword: enter email, server sends code (resetPassword).
   *   Step 2 — ForgotPasswordReset: enter code + new password, server validates
   *            and sets both atomically (confirmResetPassword).
   */
  ForgotPassword: undefined;
  ForgotPasswordReset: { email: string };
};

export type OnboardingStackParamList = {
  Name: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  /**
   * Caregiver (SUPPORT_PERSON) landing screen: greeting + the list of primary
   * users linked to this supporter. The initial Main-stack route when the
   * signed-in profile's role is SUPPORT_PERSON (see App.tsx). Selecting a
   * person drills into their (currently read-only) data.
   */
  CaregiverHome: undefined;
  /**
   * Caregiver drill-in for one supported person: an overview shell showing the
   * data a supporter can currently read (progress reports). Task/category/
   * calendar sections are shown as unavailable until the backend grants
   * supporter-scoped reads of a primary user's live data.
   */
  PatientOverview: { userId: string; displayName: string };
  Settings: undefined;
  /**
   * Own categories, or — with `ownerId` (caregiver delegated) — a linked primary
   * user's categories with full management and a "Managing {managingName}" banner.
   */
  Categories: { ownerId?: string; managingName?: string } | undefined;
  /**
   * Without params: all of the owner's tasks. With `categoryId`: only tasks in
   * that category (the back button returns to Categories; `categoryName` titles
   * the screen). With `ownerId` (caregiver delegated): a linked primary user's
   * tasks, with a "Managing {managingName}" banner; adding a task is allowed
   * (created under that user), reorder/Manage is hidden.
   */
  AllTasks:
    | {
        categoryId?: string;
        categoryName?: string;
        ownerId?: string;
        managingName?: string;
      }
    | undefined;
  ManageTasks: undefined;
  TaskView: { taskId: string };
  TaskDetail: { taskId: string };
  /**
   * `fixedCategoryId` pins the new task to one category and hides the category
   * picker (used when creating from a category view); `fixedCategoryName` titles
   * the list we return to after saving. `ownerId` (caregiver delegated) creates
   * the new task under a linked primary user (editing an existing task derives
   * the owner from the task itself, so no param is needed then).
   */
  CreateTask:
    | {
        taskId?: string;
        fixedCategoryId?: string;
        fixedCategoryName?: string;
        ownerId?: string;
        managingName?: string;
      }
    | undefined;
  CreateTaskStep: { taskId: string; stepId?: string };
  ReorderSteps: { taskId: string };
  /** Supporter-only: pick which cared-for user's reports to view. */
  ReportPeople: undefined;
  /** Report history + generation for one cared-for user. */
  Reports: { userId: string; displayName: string };
  ReportView: { userId: string; reportId: string };
};
