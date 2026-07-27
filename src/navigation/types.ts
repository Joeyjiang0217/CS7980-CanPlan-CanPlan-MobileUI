/**
 * Navigation param lists.
 *
 * Three stacks live in the app — Auth, Onboarding, Main — swapped at the
 * root (App.tsx) based on session state, not nested.
 */

import type { TaskInstanceStatus } from '../shared/api/canplanTypes';

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
   * Caregiver (SUPPORT_PERSON) landing: the list of linked primary users. The
   * initial Main-stack route when the signed-in profile's role is
   * SUPPORT_PERSON (see App.tsx).
   */
  CaregiverHome: undefined;
  /** Caregiver drill-in for one linked primary user (reports/tasks/categories/calendar). */
  PatientOverview: { userId: string; displayName: string };
  /** With `ownerId` (caregiver delegated): a linked primary user's calendar. */
  Calendar: { ownerId?: string; managingName?: string } | undefined;
  Settings: undefined;
  Interface: undefined;
  Notifications: undefined;
  AudioSpeech: undefined;
  Statistics: undefined;
  PrivacyPolicy: undefined;
  /** With `ownerId` (caregiver delegated): a linked primary user's categories. */
  Categories: { ownerId?: string; managingName?: string } | undefined;
  /**
   * Without params: all of the owner's tasks. With `categoryId`: only tasks in
   * that category (the back button returns to Categories; `categoryName` titles
   * the screen). With `ownerId` (caregiver delegated): a linked primary user's
   * tasks, with a "Managing {managingName}" banner.
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
  /**
   * View a task's steps. With the optional occurrence fields it runs as an
   * instance "runner" (step check-off + progress); without them it's a plain
   * template view.
   */
  TaskView: {
    taskId: string;
    assignmentId?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    scheduledFor?: string;
    /** Present when the occurrence is already materialized (skips re-starting it). */
    instanceId?: string;
    /** The occurrence's current status, so the runner can gate done/skip/overdue. */
    status?: TaskInstanceStatus;
    /** Set by the step player as it pages, so the list re-centres on return. */
    focusStepId?: string;
  };
  TaskDetail: { taskId: string };
  /** Single-step focus view. Occurrence fields enable the done/undo toggle. */
  StepDetail: {
    taskId: string;
    stepId: string;
    assignmentId?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    /** Present when the occurrence is already materialized (skips re-starting it). */
    instanceId?: string;
    /** Occurrence status — completed/skipped render the step read-only. */
    status?: TaskInstanceStatus;
  };
  /**
   * `fixedCategoryId` pins the new task to one category and hides the category
   * picker (used when creating from a category view); `fixedCategoryName` titles
   * the list we return to after saving.
   */
  CreateTask:
    | {
        taskId?: string;
        fixedCategoryId?: string;
        fixedCategoryName?: string;
        /** After creating a brand-new task, continue to scheduling it. */
        scheduleAfterCreate?: boolean;
        /**
         * Caregiver delegated: create the new task under a linked primary user
         * (editing an existing task derives the owner from the task itself).
         */
        ownerId?: string;
        managingName?: string;
      }
    | undefined;
  CreateTaskStep: { taskId: string; stepId?: string };
  ReorderSteps: { taskId: string };
  /** Pick an existing task to schedule onto the calendar. */
  SelectTask: undefined;
  /** Create a TaskAssignment (date/time/repeat) for an existing task. */
  ScheduleAssignment: { taskId: string; taskTitle?: string };
  /** One occurrence (from the calendar feed) — view details and delete. */
  OccurrenceDetail: {
    assignmentId: string;
    taskId: string;
    taskTitle: string;
    scheduledDate: string;
    scheduledTime: string;
    status: TaskInstanceStatus;
    isVirtual: boolean;
  };
  /** Supporter-only: pick which cared-for user's reports to view. */
  ReportPeople: undefined;
  /** Report history + generation for one cared-for user. */
  Reports: { userId: string; displayName: string };
  ReportView: { userId: string; reportId: string };
};
