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
  AdminDeleteOrganizationResult,
  AdminDeleteUserInput,
  AdminDeleteUserResult,
  AdminSetUserOrganizationInput,
  AdminUserData,
  AdminUserResult,
  CancelTaskInstanceInput,
  Category,
  Connection,
  CreateAiTaskInput,
  CreateCategoryInput,
  CreateMediaAssetInput,
  CreateMediaUploadUrlInput,
  CreateMyUserProfileInput,
  CreateOrganizationInput,
  CreateTaskAssignmentInput,
  CreateTaskCoverImageUploadUrlInput,
  CreateTaskInput,
  CreateTaskStepInput,
  DeleteCategoryInput,
  DeleteOrganizationInput,
  DeleteMediaAssetInput,
  DeleteTaskAssignmentInput,
  DeleteTaskStepInput,
  EndTaskAssignmentInput,
  GenerateReportInput,
  GenerateTaskStepsInput,
  GeneratedAiTask,
  GeneratedReport,
  InviteUserInput,
  JsonValue,
  MediaAsset,
  MediaDownloadTarget,
  MediaUploadTarget,
  Organization,
  PageInput,
  PauseTaskInstanceTimerInput,
  Report,
  ReorderTaskStepsInput,
  SaveReportInput,
  SelectPrimaryUserInput,
  SetTaskInstanceStepCompletionInput,
  SetSystemAdminInput,
  SetUserBaseRoleInput,
  StartTaskInstanceInput,
  StartTaskInstanceStepInput,
  SupportLink,
  Task,
  TaskAssignment,
  TaskInstance,
  TaskInstanceLookupResult,
  TaskInstanceStep,
  TaskInstanceTimingResult,
  TaskInstanceView,
  TaskStep,
  TaskStepsResponse,
  UnselectPrimaryUserInput,
  UpdateCategoryInput,
  UpdateOrganizationInput,
  UpdateMyUserProfileInput,
  UpdateTaskOrderInput,
  UpdateTaskInput,
  UpdateTaskInstanceStatusInput,
  UpdateTaskStepInput,
  UserProfile,
} from './canplanTypes';

type RawUserProfile = Omit<UserProfile, 'accessibilitySettings'> & {
  accessibilitySettings?: string | null;
};

type RawReport = Omit<Report, 'scope' | 'dateRange' | 'stats'> & {
  scope?: string | null;
  dateRange?: string | null;
  stats?: string | null;
};

type RawGeneratedReport = Omit<GeneratedReport, 'scope' | 'dateRange' | 'stats'> & {
  scope?: string | null;
  dateRange?: string | null;
  stats?: string | null;
};

type RawAdminUserResult = Omit<AdminUserResult, 'profile'> & {
  profile?: RawUserProfile | null;
};

type RawAdminUserData = Omit<AdminUserData, 'profile'> & {
  profile?: RawUserProfile | null;
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

function mapReport(report: RawReport): Report {
  return {
    ...report,
    scope: parseAwsJson(report.scope, 'Report.scope'),
    dateRange: parseAwsJson(report.dateRange, 'Report.dateRange'),
    stats: parseAwsJson(report.stats, 'Report.stats'),
  };
}

function mapGeneratedReport(report: RawGeneratedReport): GeneratedReport {
  return {
    ...report,
    scope: parseAwsJson(report.scope, 'GeneratedReport.scope'),
    dateRange: parseAwsJson(report.dateRange, 'GeneratedReport.dateRange'),
    stats: parseAwsJson(report.stats, 'GeneratedReport.stats'),
  };
}

function mapAdminUserResult(result: RawAdminUserResult): AdminUserResult {
  return {
    ...result,
    profile: result.profile ? mapUserProfile(result.profile) : result.profile,
  };
}

function mapAdminUserData(data: RawAdminUserData): AdminUserData {
  return {
    ...data,
    profile: data.profile ? mapUserProfile(data.profile) : data.profile,
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

  async listMyOrganizationUsers(
    page: PageInput = {},
  ): Promise<Connection<UserProfile>> {
    const data = await graphqlRequest<
      { listMyOrganizationUsers: Connection<RawUserProfile> },
      PageInput
    >(operations.LIST_MY_ORGANIZATION_USERS, pageVariables(page));
    return mapConnection(data.listMyOrganizationUsers, mapUserProfile);
  },

  async listMySupportList(
    page: PageInput = {},
  ): Promise<Connection<SupportLink>> {
    const data = await graphqlRequest<
      { listMySupportList: Connection<SupportLink> },
      PageInput
    >(operations.LIST_MY_SUPPORT_LIST, pageVariables(page));
    return data.listMySupportList;
  },

  async listMyCategories(
    page: PageInput = {},
    userId?: string | null,
  ): Promise<Connection<Category>> {
    const data = await graphqlRequest<
      { listMyCategories: Connection<Category> },
      { userId?: string | null } & PageInput
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

  async listTaskAssignmentsForUser(
    userId: string,
    page: PageInput = {},
  ): Promise<Connection<TaskAssignment>> {
    const data = await graphqlRequest<
      { listTaskAssignmentsForUser: Connection<TaskAssignment> },
      { userId: string } & PageInput
    >(operations.LIST_TASK_ASSIGNMENTS_FOR_USER, { userId, ...pageVariables(page) });
    return data.listTaskAssignmentsForUser;
  },

  async getTaskInstanceViews(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<Connection<TaskInstanceView>> {
    const data = await graphqlRequest<
      { getTaskInstanceViews: Connection<TaskInstanceView> },
      { userId: string; startDate: string; endDate: string }
    >(operations.GET_TASK_INSTANCE_VIEWS, { userId, startDate, endDate });
    return data.getTaskInstanceViews;
  },

  async listTaskInstanceSteps(
    userId: string,
    instanceId: string,
    page: PageInput = {},
  ): Promise<Connection<TaskInstanceStep>> {
    const data = await graphqlRequest<
      { listTaskInstanceSteps: Connection<TaskInstanceStep> },
      { userId: string; instanceId: string } & PageInput
    >(
      operations.LIST_TASK_INSTANCE_STEPS,
      { userId, instanceId, ...pageVariables(page) },
    );
    return data.listTaskInstanceSteps;
  },

  async getTaskInstance(instanceId: string): Promise<TaskInstance | null> {
    const data = await graphqlRequest<
      { getTaskInstance: TaskInstance | null },
      { instanceId: string }
    >(operations.GET_TASK_INSTANCE, { instanceId });
    return data.getTaskInstance;
  },

  async listTaskInstances(
    startDate: string,
    endDate: string,
    page: PageInput = {},
  ): Promise<Connection<TaskInstance>> {
    const data = await graphqlRequest<
      { listTaskInstances: Connection<TaskInstance> },
      { startDate: string; endDate: string } & PageInput
    >(operations.LIST_TASK_INSTANCES, { startDate, endDate, ...pageVariables(page) });
    return data.listTaskInstances;
  },

  async batchGetTaskInstances(instanceIds: string[]): Promise<TaskInstanceLookupResult[]> {
    const data = await graphqlRequest<
      { batchGetTaskInstances: TaskInstanceLookupResult[] },
      { instanceIds: string[] }
    >(operations.BATCH_GET_TASK_INSTANCES, { instanceIds });
    return data.batchGetTaskInstances;
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

  async adminGetUserData(userId: string): Promise<AdminUserData> {
    const data = await graphqlRequest<
      { adminGetUserData: RawAdminUserData },
      { userId: string }
    >(operations.ADMIN_GET_USER_DATA, { userId });
    return mapAdminUserData(data.adminGetUserData);
  },

  async listAllOrganizations(page: PageInput = {}): Promise<Connection<Organization>> {
    const data = await graphqlRequest<
      { listAllOrganizations: Connection<Organization> },
      PageInput
    >(operations.LIST_ALL_ORGANIZATIONS, pageVariables(page));
    return data.listAllOrganizations;
  },

  async adminListOrganizationUsers(
    organizationId: string,
    page: PageInput = {},
  ): Promise<Connection<UserProfile>> {
    const data = await graphqlRequest<
      { adminListOrganizationUsers: Connection<RawUserProfile> },
      { organizationId: string } & PageInput
    >(
      operations.ADMIN_LIST_ORGANIZATION_USERS,
      { organizationId, ...pageVariables(page) },
    );
    return mapConnection(data.adminListOrganizationUsers, mapUserProfile);
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

  async selectPrimaryUser(input: SelectPrimaryUserInput): Promise<SupportLink> {
    const data = await graphqlRequest<
      { selectPrimaryUser: SupportLink },
      { input: SelectPrimaryUserInput }
    >(operations.SELECT_PRIMARY_USER, { input });
    return data.selectPrimaryUser;
  },

  async unselectPrimaryUser(input: UnselectPrimaryUserInput): Promise<SupportLink> {
    const data = await graphqlRequest<
      { unselectPrimaryUser: SupportLink },
      { input: UnselectPrimaryUserInput }
    >(operations.UNSELECT_PRIMARY_USER, { input });
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

  async createAiTask(input: CreateAiTaskInput): Promise<GeneratedAiTask> {
    const data = await graphqlRequest<
      { createAiTask: GeneratedAiTask },
      { input: CreateAiTaskInput }
    >(operations.CREATE_AI_TASK, { input });
    return data.createAiTask;
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

  async updateTaskOrder(input: UpdateTaskOrderInput): Promise<Task[]> {
    const data = await graphqlRequest<
      { updateTaskOrder: Task[] },
      { input: UpdateTaskOrderInput }
    >(operations.UPDATE_TASK_ORDER, { input });
    return data.updateTaskOrder;
  },

  async deleteTask(taskId: string): Promise<Task | null> {
    const data = await graphqlRequest<{ deleteTask: Task | null }, { taskId: string }>(
      operations.DELETE_TASK,
      { taskId },
    );
    return data.deleteTask;
  },

  async createTaskAssignment(input: CreateTaskAssignmentInput): Promise<TaskAssignment> {
    const data = await graphqlRequest<
      { createTaskAssignment: TaskAssignment },
      { input: CreateTaskAssignmentInput }
    >(operations.CREATE_TASK_ASSIGNMENT, { input });
    return data.createTaskAssignment;
  },

  async startTaskInstance(input: StartTaskInstanceInput): Promise<TaskInstance> {
    const data = await graphqlRequest<
      { startTaskInstance: TaskInstance },
      { input: StartTaskInstanceInput }
    >(operations.START_TASK_INSTANCE, { input });
    return data.startTaskInstance;
  },

  async updateTaskInstanceStatus(
    input: UpdateTaskInstanceStatusInput,
  ): Promise<TaskInstance> {
    const data = await graphqlRequest<
      { updateTaskInstanceStatus: TaskInstance },
      { input: UpdateTaskInstanceStatusInput }
    >(operations.UPDATE_TASK_INSTANCE_STATUS, { input });
    return data.updateTaskInstanceStatus;
  },

  async setTaskInstanceStepCompletion(
    input: SetTaskInstanceStepCompletionInput,
  ): Promise<TaskInstanceStep> {
    const data = await graphqlRequest<
      { setTaskInstanceStepCompletion: TaskInstanceStep },
      { input: SetTaskInstanceStepCompletionInput }
    >(operations.SET_TASK_INSTANCE_STEP_COMPLETION, { input });
    return data.setTaskInstanceStepCompletion;
  },

  async startTaskInstanceStep(
    input: StartTaskInstanceStepInput,
  ): Promise<TaskInstanceTimingResult> {
    const data = await graphqlRequest<
      { startTaskInstanceStep: TaskInstanceTimingResult },
      { input: StartTaskInstanceStepInput }
    >(operations.START_TASK_INSTANCE_STEP, { input });
    return data.startTaskInstanceStep;
  },

  async pauseTaskInstanceTimer(
    input: PauseTaskInstanceTimerInput,
  ): Promise<TaskInstanceTimingResult> {
    const data = await graphqlRequest<
      { pauseTaskInstanceTimer: TaskInstanceTimingResult },
      { input: PauseTaskInstanceTimerInput }
    >(operations.PAUSE_TASK_INSTANCE_TIMER, { input });
    return data.pauseTaskInstanceTimer;
  },

  async cancelTaskInstance(input: CancelTaskInstanceInput): Promise<TaskInstance> {
    const data = await graphqlRequest<
      { cancelTaskInstance: TaskInstance },
      { input: CancelTaskInstanceInput }
    >(operations.CANCEL_TASK_INSTANCE, { input });
    return data.cancelTaskInstance;
  },

  async endTaskAssignment(input: EndTaskAssignmentInput): Promise<TaskAssignment> {
    const data = await graphqlRequest<
      { endTaskAssignment: TaskAssignment },
      { input: EndTaskAssignmentInput }
    >(operations.END_TASK_ASSIGNMENT, { input });
    return data.endTaskAssignment;
  },

  async deleteTaskAssignment(input: DeleteTaskAssignmentInput): Promise<TaskAssignment> {
    const data = await graphqlRequest<
      { deleteTaskAssignment: TaskAssignment },
      { input: DeleteTaskAssignmentInput }
    >(operations.DELETE_TASK_ASSIGNMENT, { input });
    return data.deleteTaskAssignment;
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

  async generateReport(input: GenerateReportInput): Promise<GeneratedReport> {
    const data = await graphqlRequest<
      { generateReport: RawGeneratedReport },
      { input: GenerateReportInput }
    >(operations.GENERATE_REPORT, { input });
    return mapGeneratedReport(data.generateReport);
  },

  async saveReport(input: SaveReportInput): Promise<Report> {
    const data = await graphqlRequest<
      { saveReport: RawReport },
      {
        input: Omit<SaveReportInput, 'scope' | 'dateRange' | 'stats'> & {
          scope: string;
          dateRange: string;
          stats: string;
        };
      }
    >(operations.SAVE_REPORT, {
      input: {
        ...input,
        scope: JSON.stringify(input.scope),
        dateRange: JSON.stringify(input.dateRange),
        stats: JSON.stringify(input.stats),
      },
    });
    return mapReport(data.saveReport);
  },

  async deleteReport(userId: string, reportId: string): Promise<boolean> {
    const data = await graphqlRequest<
      { deleteReport: boolean },
      { userId: string; reportId: string }
    >(operations.DELETE_REPORT, { userId, reportId });
    return data.deleteReport;
  },

  async inviteSupportPerson(input: InviteUserInput): Promise<AdminUserResult> {
    const data = await graphqlRequest<
      { inviteSupportPerson: RawAdminUserResult },
      { input: InviteUserInput }
    >(operations.INVITE_SUPPORT_PERSON, { input });
    return mapAdminUserResult(data.inviteSupportPerson);
  },

  async inviteOrganizationAdmin(input: InviteUserInput): Promise<AdminUserResult> {
    const data = await graphqlRequest<
      { inviteOrganizationAdmin: RawAdminUserResult },
      { input: InviteUserInput }
    >(operations.INVITE_ORGANIZATION_ADMIN, { input });
    return mapAdminUserResult(data.inviteOrganizationAdmin);
  },

  async setUserBaseRole(input: SetUserBaseRoleInput): Promise<AdminUserResult> {
    const data = await graphqlRequest<
      { setUserBaseRole: RawAdminUserResult },
      { input: SetUserBaseRoleInput }
    >(operations.SET_USER_BASE_ROLE, { input });
    return mapAdminUserResult(data.setUserBaseRole);
  },

  async setSystemAdmin(input: SetSystemAdminInput): Promise<AdminUserResult> {
    const data = await graphqlRequest<
      { setSystemAdmin: RawAdminUserResult },
      { input: SetSystemAdminInput }
    >(operations.SET_SYSTEM_ADMIN, { input });
    return mapAdminUserResult(data.setSystemAdmin);
  },

  async adminDeleteTask(taskId: string): Promise<Task | null> {
    const data = await graphqlRequest<
      { adminDeleteTask: Task | null },
      { taskId: string }
    >(operations.ADMIN_DELETE_TASK, { taskId });
    return data.adminDeleteTask;
  },

  async adminDeleteUser(input: AdminDeleteUserInput): Promise<AdminDeleteUserResult> {
    const data = await graphqlRequest<
      { adminDeleteUser: AdminDeleteUserResult },
      { input: AdminDeleteUserInput }
    >(operations.ADMIN_DELETE_USER, { input });
    return data.adminDeleteUser;
  },

  async adminCreateOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const data = await graphqlRequest<
      { adminCreateOrganization: Organization },
      { input: CreateOrganizationInput }
    >(operations.ADMIN_CREATE_ORGANIZATION, { input });
    return data.adminCreateOrganization;
  },

  async adminUpdateOrganization(input: UpdateOrganizationInput): Promise<Organization> {
    const data = await graphqlRequest<
      { adminUpdateOrganization: Organization },
      { input: UpdateOrganizationInput }
    >(operations.ADMIN_UPDATE_ORGANIZATION, { input });
    return data.adminUpdateOrganization;
  },

  async adminDeleteOrganization(
    input: DeleteOrganizationInput,
  ): Promise<AdminDeleteOrganizationResult> {
    const data = await graphqlRequest<
      { adminDeleteOrganization: AdminDeleteOrganizationResult },
      { input: DeleteOrganizationInput }
    >(operations.ADMIN_DELETE_ORGANIZATION, { input });
    return data.adminDeleteOrganization;
  },

  async adminSetUserOrganization(
    input: AdminSetUserOrganizationInput,
  ): Promise<UserProfile> {
    const data = await graphqlRequest<
      { adminSetUserOrganization: RawUserProfile },
      { input: AdminSetUserOrganizationInput }
    >(operations.ADMIN_SET_USER_ORGANIZATION, { input });
    return mapUserProfile(data.adminSetUserOrganization);
  },
};
