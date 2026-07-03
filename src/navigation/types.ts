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
  Settings: undefined;
  Categories: undefined;
  /**
   * Without params: all of the owner's tasks. With `categoryId`: only tasks in
   * that category (the back button returns to Categories; `categoryName` titles
   * the screen).
   */
  AllTasks: { categoryId?: string; categoryName?: string } | undefined;
  ManageTasks: undefined;
  TaskView: { taskId: string };
  TaskDetail: { taskId: string };
  /**
   * `fixedCategoryId` pins the new task to one category and hides the category
   * picker (used when creating from a category view); `fixedCategoryName` titles
   * the list we return to after saving.
   */
  CreateTask:
    | { taskId?: string; fixedCategoryId?: string; fixedCategoryName?: string }
    | undefined;
  CreateTaskStep: { taskId: string; stepId?: string };
  ReorderSteps: { taskId: string };
  /** Supporter-only: pick which cared-for user's reports to view. */
  ReportPeople: undefined;
  /** Report history + generation for one cared-for user. */
  Reports: { userId: string; displayName: string };
  ReportView: { userId: string; reportId: string };
};
