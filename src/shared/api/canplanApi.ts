/**
 * Typed CanPlan API client.
 *
 * This is the only layer that knows GraphQL document names and AWSJSON's
 * string-on-the-wire representation. Feature APIs and hooks consume this
 * module's schema-shaped TypeScript contract instead.
 */

import { GraphQLRequestError } from './errors';
import { graphqlRequest } from './graphqlClient';
import * as operations from './canplanOperations';
import type {
  Assignment,
  AssignmentStep,
  Category,
  Connection,
  CreateAiTaskInput,
  CreateAssignmentInput,
  CreateCategoryInput,
  CreateMediaAssetInput,
  CreateMediaUploadUrlInput,
  CreateMyUserProfileInput,
  CreateTaskCoverImageUploadUrlInput,
  CreateTaskInput,
  CreateTaskStepInput,
  DeleteAssignmentInput,
  DeleteCategoryInput,
  DeleteMediaAssetInput,
  DeleteTaskStepInput,
  GeneratedAiTask,
  GeneratedReport,
  GenerateReportInput,
  GenerateTaskStepsInput,
  JsonValue,
  MediaAsset,
  MediaDownloadTarget,
  MediaUploadTarget,
  PageInput,
  ReorderTaskStepsInput,
  Report,
  SaveReportInput,
  SelectPrimaryUserInput,
  SetAssignmentStepCompletionInput,
  SupportLink,
  UnselectPrimaryUserInput,
  Task,
  TaskStep,
  TaskStepsResponse,
  UpdateAssignmentStatusInput,
  UpdateCategoryInput,
  UpdateMyUserProfileInput,
  UpdateTaskInput,
  UpdateTaskStepInput,
  UserProfile,
} from './canplanTypes';

type RawUserProfile = Omit<UserProfile, 'accessibilitySettings'> & {
  accessibilitySettings?: string | null;
};

function parseAwsJson(
  value: string | null | undefined,
  fieldName: string,
): JsonValue | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    throw new GraphQLRequestError(
      `The API returned invalid AWSJSON for ${fieldName}.`,
    );
  }
}

function toAwsJson(value: JsonValue | undefined): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

function mapUserProfile(profile: RawUserProfile): UserProfile {
  return {
    ...profile,
    accessibilitySettings: parseAwsJson(
      profile.accessibilitySettings,
      'UserProfile.accessibilitySettings',
    ),
  };
}

type RawReport = Omit<Report, 'scope' | 'dateRange'> & {
  scope?: string | null;
  dateRange?: string | null;
};

function mapReport(report: RawReport): Report {
  return {
    ...report,
    scope: parseAwsJson(report.scope, 'Report.scope') as unknown as Report['scope'],
    dateRange: parseAwsJson(
      report.dateRange,
      'Report.dateRange',
    ) as unknown as Report['dateRange'],
  };
}

function mapConnection<TInput, TOutput>(
  connection: Connection<TInput>,
  mapItem: (item: TInput) => TOutput,
): Connection<TOutput> {
  return {
    items: connection.items.map(mapItem),
    nextToken: connection.nextToken,
  };
}

function pageVariables(page: PageInput): PageInput {
  return {
    limit: page.limit,
    nextToken: page.nextToken,
  };
}

/** All GraphQL queries and mutations supported by the current schema. */
export const canPlanApi = {
  async healthCheck(): Promise<string> {
    const data = await graphqlRequest<{ healthCheck: string }>(
      operations.HEALTH_CHECK,
    );
    return data.healthCheck;
  },

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const data = await graphqlRequest<{ getUserProfile: RawUserProfile | null }, { userId: string }>(
      operations.GET_USER_PROFILE,
      { userId },
    );
    return data.getUserProfile ? mapUserProfile(data.getUserProfile) : null;
  },

  async listUsersByOrganization(
    organizationId: string,
    page: PageInput = {},
  ): Promise<Connection<UserProfile>> {
    const data = await graphqlRequest<
      { listUsersByOrganization: Connection<RawUserProfile> },
      { organizationId: string } & PageInput
    >(operations.LIST_USERS_BY_ORGANIZATION, { organizationId, ...pageVariables(page) });
    return mapConnection(data.listUsersByOrganization, mapUserProfile);
  },

  /** Primary users the caller (a SupportPerson) currently has an effective link to. */
  async listMySupportList(page: PageInput = {}): Promise<Connection<SupportLink>> {
    const data = await graphqlRequest<
      { listMySupportList: Connection<SupportLink> },
      PageInput
    >(operations.LIST_MY_SUPPORT_LIST, pageVariables(page));
    return data.listMySupportList;
  },

  /** Members of the caller's own organization (used to find primary users to link). */
  async listMyOrganizationUsers(
    page: PageInput = {},
  ): Promise<Connection<UserProfile>> {
    const data = await graphqlRequest<
      { listMyOrganizationUsers: Connection<RawUserProfile> },
      PageInput
    >(operations.LIST_MY_ORGANIZATION_USERS, pageVariables(page));
    return mapConnection(data.listMyOrganizationUsers, mapUserProfile);
  },

  /** Delegated: pass a primary user's id to read their categories; omit for the caller's own. */
  async listMyCategories(
    userId?: string,
    page: PageInput = {},
  ): Promise<Connection<Category>> {
    const data = await graphqlRequest<
      { listMyCategories: Connection<Category> },
      { userId?: string } & PageInput
    >(operations.LIST_MY_CATEGORIES, { userId, ...pageVariables(page) });
    return data.listMyCategories;
  },

  async getTask(taskId: string): Promise<Task | null> {
    const data = await graphqlRequest<{ getTask: Task | null }, { taskId: string }>(
      operations.GET_TASK,
      { taskId },
    );
    return data.getTask;
  },

  async listTaskSteps(
    taskId: string,
    page: PageInput = {},
  ): Promise<Connection<TaskStep>> {
    const data = await graphqlRequest<
      { listTaskSteps: Connection<TaskStep> },
      { taskId: string } & PageInput
    >(operations.LIST_TASK_STEPS, { taskId, ...pageVariables(page) });
    return data.listTaskSteps;
  },

  async listTasksByOwner(
    ownerId: string,
    page: PageInput = {},
  ): Promise<Connection<Task>> {
    const data = await graphqlRequest<
      { listTasksByOwner: Connection<Task> },
      { ownerId: string } & PageInput
    >(operations.LIST_TASKS_BY_OWNER, { ownerId, ...pageVariables(page) });
    return data.listTasksByOwner;
  },

  async listTasksByCategory(
    ownerId: string,
    categoryId: string,
    page: PageInput = {},
  ): Promise<Connection<Task>> {
    const data = await graphqlRequest<
      { listTasksByCategory: Connection<Task> },
      { ownerId: string; categoryId: string } & PageInput
    >(
      operations.LIST_TASKS_BY_CATEGORY,
      { ownerId, categoryId, ...pageVariables(page) },
    );
    return data.listTasksByCategory;
  },

  async listAssignmentsForUser(
    userId: string,
    page: PageInput = {},
  ): Promise<Connection<Assignment>> {
    const data = await graphqlRequest<
      { listAssignmentsForUser: Connection<Assignment> },
      { userId: string } & PageInput
    >(operations.LIST_ASSIGNMENTS_FOR_USER, { userId, ...pageVariables(page) });
    return data.listAssignmentsForUser;
  },

  async listAssignmentSteps(
    userId: string,
    assignmentId: string,
    page: PageInput = {},
  ): Promise<Connection<AssignmentStep>> {
    const data = await graphqlRequest<
      { listAssignmentSteps: Connection<AssignmentStep> },
      { userId: string; assignmentId: string } & PageInput
    >(
      operations.LIST_ASSIGNMENT_STEPS,
      { userId, assignmentId, ...pageVariables(page) },
    );
    return data.listAssignmentSteps;
  },

  async getMediaDownloadUrl(
    taskId: string,
    assetId: string,
  ): Promise<MediaDownloadTarget | null> {
    const data = await graphqlRequest<
      { getMediaDownloadUrl: MediaDownloadTarget | null },
      { taskId: string; assetId: string }
    >(operations.GET_MEDIA_DOWNLOAD_URL, { taskId, assetId });
    return data.getMediaDownloadUrl;
  },

  async listMediaForTask(
    taskId: string,
    page: PageInput = {},
  ): Promise<Connection<MediaAsset>> {
    const data = await graphqlRequest<
      { listMediaForTask: Connection<MediaAsset> },
      { taskId: string } & PageInput
    >(operations.LIST_MEDIA_FOR_TASK, { taskId, ...pageVariables(page) });
    return data.listMediaForTask;
  },

  async listAllUsers(page: PageInput = {}): Promise<Connection<UserProfile>> {
    const data = await graphqlRequest<
      { listAllUsers: Connection<RawUserProfile> },
      PageInput
    >(operations.LIST_ALL_USERS, pageVariables(page));
    return mapConnection(data.listAllUsers, mapUserProfile);
  },

  async listAllTasks(page: PageInput = {}): Promise<Connection<Task>> {
    const data = await graphqlRequest<{ listAllTasks: Connection<Task> }, PageInput>(
      operations.LIST_ALL_TASKS,
      pageVariables(page),
    );
    return data.listAllTasks;
  },

  async createUserProfile(input: CreateMyUserProfileInput): Promise<UserProfile | null> {
    const data = await graphqlRequest<
      { createUserProfile: RawUserProfile | null },
      { input: Omit<CreateMyUserProfileInput, 'accessibilitySettings'> & { accessibilitySettings?: string } }
    >(operations.CREATE_USER_PROFILE, {
      input: {
        ...input,
        accessibilitySettings: toAwsJson(input.accessibilitySettings),
      },
    });
    return data.createUserProfile ? mapUserProfile(data.createUserProfile) : null;
  },

  async updateMyUserProfile(input: UpdateMyUserProfileInput): Promise<UserProfile> {
    // accessibilitySettings is AWSJSON: omitted ⇒ unchanged, explicit null ⇒
    // cleared (sent as GraphQL null, not the string "null"), object ⇒ JSON
    // string (full replacement — the API does not deep-merge).
    const accessibilitySettings =
      input.accessibilitySettings === undefined
        ? undefined
        : input.accessibilitySettings === null
          ? null
          : JSON.stringify(input.accessibilitySettings);

    const data = await graphqlRequest<
      { updateMyUserProfile: RawUserProfile },
      { input: Omit<UpdateMyUserProfileInput, 'accessibilitySettings'> & { accessibilitySettings?: string | null } }
    >(operations.UPDATE_MY_USER_PROFILE, {
      input: { ...input, accessibilitySettings },
    });
    return mapUserProfile(data.updateMyUserProfile);
  },

  /** Establish (or restore) the caller's support link to a primary user in the same org. */
  async selectPrimaryUser(primaryUserId: string): Promise<SupportLink> {
    const data = await graphqlRequest<
      { selectPrimaryUser: SupportLink },
      { input: SelectPrimaryUserInput }
    >(operations.SELECT_PRIMARY_USER, { input: { primaryUserId } });
    return data.selectPrimaryUser;
  },

  /** Soft-revoke the caller's support link to a primary user. */
  async unselectPrimaryUser(primaryUserId: string): Promise<SupportLink> {
    const data = await graphqlRequest<
      { unselectPrimaryUser: SupportLink },
      { input: UnselectPrimaryUserInput }
    >(operations.UNSELECT_PRIMARY_USER, { input: { primaryUserId } });
    return data.unselectPrimaryUser;
  },

  async createCategory(input: CreateCategoryInput): Promise<Category | null> {
    const data = await graphqlRequest<{ createCategory: Category | null }, { input: CreateCategoryInput }>(
      operations.CREATE_CATEGORY,
      { input },
    );
    return data.createCategory;
  },

  async updateCategory(input: UpdateCategoryInput): Promise<Category | null> {
    const data = await graphqlRequest<{ updateCategory: Category | null }, { input: UpdateCategoryInput }>(
      operations.UPDATE_CATEGORY,
      { input },
    );
    return data.updateCategory;
  },

  async deleteCategory(input: DeleteCategoryInput): Promise<Category | null> {
    const data = await graphqlRequest<{ deleteCategory: Category | null }, { input: DeleteCategoryInput }>(
      operations.DELETE_CATEGORY,
      { input },
    );
    return data.deleteCategory;
  },

  async createTask(input: CreateTaskInput): Promise<Task | null> {
    const data = await graphqlRequest<{ createTask: Task | null }, { input: CreateTaskInput }>(
      operations.CREATE_TASK,
      { input },
    );
    return data.createTask;
  },

  async updateTask(input: UpdateTaskInput): Promise<Task | null> {
    const data = await graphqlRequest<{ updateTask: Task | null }, { input: UpdateTaskInput }>(
      operations.UPDATE_TASK,
      { input },
    );
    return data.updateTask;
  },

  async createTaskStep(input: CreateTaskStepInput): Promise<TaskStep | null> {
    const data = await graphqlRequest<{ createTaskStep: TaskStep | null }, { input: CreateTaskStepInput }>(
      operations.CREATE_TASK_STEP,
      { input },
    );
    return data.createTaskStep;
  },

  async updateTaskStep(input: UpdateTaskStepInput): Promise<TaskStep | null> {
    const data = await graphqlRequest<{ updateTaskStep: TaskStep | null }, { input: UpdateTaskStepInput }>(
      operations.UPDATE_TASK_STEP,
      { input },
    );
    return data.updateTaskStep;
  },

  async deleteTaskStep(input: DeleteTaskStepInput): Promise<TaskStep | null> {
    const data = await graphqlRequest<{ deleteTaskStep: TaskStep | null }, { input: DeleteTaskStepInput }>(
      operations.DELETE_TASK_STEP,
      { input },
    );
    return data.deleteTaskStep;
  },

  async reorderTaskSteps(input: ReorderTaskStepsInput): Promise<TaskStep[]> {
    const data = await graphqlRequest<{ reorderTaskSteps: TaskStep[] }, { input: ReorderTaskStepsInput }>(
      operations.REORDER_TASK_STEPS,
      { input },
    );
    return data.reorderTaskSteps;
  },

  async deleteTask(taskId: string): Promise<Task | null> {
    const data = await graphqlRequest<{ deleteTask: Task | null }, { taskId: string }>(
      operations.DELETE_TASK,
      { taskId },
    );
    return data.deleteTask;
  },

  async createAssignment(input: CreateAssignmentInput): Promise<Assignment | null> {
    const data = await graphqlRequest<{ createAssignment: Assignment | null }, { input: CreateAssignmentInput }>(
      operations.CREATE_ASSIGNMENT,
      { input },
    );
    return data.createAssignment;
  },

  async updateAssignmentStatus(
    input: UpdateAssignmentStatusInput,
  ): Promise<Assignment | null> {
    const data = await graphqlRequest<
      { updateAssignmentStatus: Assignment | null },
      { input: UpdateAssignmentStatusInput }
    >(operations.UPDATE_ASSIGNMENT_STATUS, { input });
    return data.updateAssignmentStatus;
  },

  async setAssignmentStepCompletion(
    input: SetAssignmentStepCompletionInput,
  ): Promise<AssignmentStep | null> {
    const data = await graphqlRequest<
      { setAssignmentStepCompletion: AssignmentStep | null },
      { input: SetAssignmentStepCompletionInput }
    >(operations.SET_ASSIGNMENT_STEP_COMPLETION, { input });
    return data.setAssignmentStepCompletion;
  },

  async deleteAssignment(input: DeleteAssignmentInput): Promise<Assignment | null> {
    const data = await graphqlRequest<{ deleteAssignment: Assignment | null }, { input: DeleteAssignmentInput }>(
      operations.DELETE_ASSIGNMENT,
      { input },
    );
    return data.deleteAssignment;
  },

  async createMediaUploadUrl(
    input: CreateMediaUploadUrlInput,
  ): Promise<MediaUploadTarget | null> {
    const data = await graphqlRequest<
      { createMediaUploadUrl: MediaUploadTarget | null },
      { input: CreateMediaUploadUrlInput }
    >(operations.CREATE_MEDIA_UPLOAD_URL, { input });
    return data.createMediaUploadUrl;
  },

  async createMediaAsset(input: CreateMediaAssetInput): Promise<MediaAsset | null> {
    const data = await graphqlRequest<{ createMediaAsset: MediaAsset | null }, { input: CreateMediaAssetInput }>(
      operations.CREATE_MEDIA_ASSET,
      { input },
    );
    return data.createMediaAsset;
  },

  async createTaskCoverImageUploadUrl(
    input: CreateTaskCoverImageUploadUrlInput,
  ): Promise<MediaUploadTarget> {
    const data = await graphqlRequest<
      { createTaskCoverImageUploadUrl: MediaUploadTarget },
      { input: CreateTaskCoverImageUploadUrlInput }
    >(operations.CREATE_TASK_COVER_IMAGE_UPLOAD_URL, { input });
    return data.createTaskCoverImageUploadUrl;
  },

  async deleteMediaAsset(input: DeleteMediaAssetInput): Promise<MediaAsset | null> {
    const data = await graphqlRequest<{ deleteMediaAsset: MediaAsset | null }, { input: DeleteMediaAssetInput }>(
      operations.DELETE_MEDIA_ASSET,
      { input },
    );
    return data.deleteMediaAsset;
  },

  async generateTaskSteps(input: GenerateTaskStepsInput): Promise<TaskStepsResponse> {
    const data = await graphqlRequest<
      { generateTaskSteps: TaskStepsResponse },
      { input: GenerateTaskStepsInput }
    >(operations.GENERATE_TASK_STEPS, { input });
    return data.generateTaskSteps;
  },

  async createAiTask(input: CreateAiTaskInput): Promise<GeneratedAiTask> {
    const data = await graphqlRequest<
      { createAiTask: GeneratedAiTask },
      { input: CreateAiTaskInput }
    >(operations.CREATE_AI_TASK, { input });
    return data.createAiTask;
  },

  async listReports(userId: string, page: PageInput = {}): Promise<Connection<Report>> {
    const data = await graphqlRequest<
      { listReports: Connection<RawReport> },
      { userId: string } & PageInput
    >(operations.LIST_REPORTS, { userId, ...pageVariables(page) });
    return mapConnection(data.listReports, mapReport);
  },

  async getReportDownloadUrl(
    userId: string,
    reportId: string,
  ): Promise<MediaDownloadTarget> {
    const data = await graphqlRequest<
      { getReportDownloadUrl: MediaDownloadTarget },
      { userId: string; reportId: string }
    >(operations.GET_REPORT_DOWNLOAD_URL, { userId, reportId });
    return data.getReportDownloadUrl;
  },

  /** Step 1 of report creation: produce an UNSAVED draft (+ draftToken). */
  async generateReport(input: GenerateReportInput): Promise<GeneratedReport> {
    const data = await graphqlRequest<
      { generateReport: GeneratedReport },
      { input: GenerateReportInput }
    >(operations.GENERATE_REPORT, { input });
    return data.generateReport;
  },

  /** Step 2: persist a draft from generateReport (fields echoed back verbatim). */
  async saveReport(input: SaveReportInput): Promise<Report> {
    const data = await graphqlRequest<
      { saveReport: RawReport },
      { input: SaveReportInput }
    >(operations.SAVE_REPORT, { input });
    return mapReport(data.saveReport);
  },
};
