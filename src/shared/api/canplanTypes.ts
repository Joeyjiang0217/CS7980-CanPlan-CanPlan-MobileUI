/**
 * TypeScript contract for the CanPlan GraphQL schema.
 *
 * These are the public client types, not generated transport types. In
 * particular, AWSJSON values are exposed as parsed JSON and encoded by
 * `canplanApi` before they are sent to AppSync.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export type UserRole = 'PRIMARY_USER' | 'SUPPORT_PERSON' | 'ORG_ADMIN';
export type SupportLinkStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';
export type MediaType = 'IMAGE' | 'AUDIO' | 'VIDEO';
export type AdminBaseRole = 'PRIMARY_USER' | 'SUPPORT_PERSON' | 'ORG_ADMIN';
export type AiTaskGroundingMode = 'GROUNDED_ONLY' | 'ALLOW_UNGROUNDED_FALLBACK';
export type AiTaskGenerationSource = 'CORPUS' | 'UNGROUNDED_AI';

/** How a TaskAssignment recurs: a single occurrence, or a recurrence rule. */
export type TaskAssignmentScheduleType = 'ONE_TIME' | 'RECURRING';

/**
 * A TaskInstance's lifecycle. OVERDUE is a derived, read-only status; clients
 * must never send it to a mutation.
 */
export type TaskInstanceStatus =
  | 'TO_DO'
  | 'IN_PROGRESS'
  | 'OVERDUE'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED';
/**
 * Values accepted by updateTaskInstanceStatus. OVERDUE is derived; CANCELLED
 * goes through cancelTaskInstance instead.
 */
export type PersistedTaskInstanceStatus = 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface UserProfile {
  userId: string;
  role: UserRole;
  displayName?: string | null;
  email?: string | null;
  organizationId?: string | null;
  accessibilitySettings?: JsonValue | null;
  defaultCategoryId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SupportLink {
  supporterId: string;
  primaryUserId: string;
  userId: string;
  status: SupportLinkStatus;
  createdAt: string;
  updatedAt?: string | null;
}

export interface Organization {
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  categoryId: string;
  ownerId: string;
  name: string;
  color?: string | null;
  sortOrder?: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A reusable task template. It carries NO scheduling data — scheduling lives on
 * TaskAssignment, and per-occurrence status/completion on TaskInstance /
 * TaskInstanceStep.
 */
export interface Task {
  taskId: string;
  ownerId: string;
  title: string;
  categoryId: string;
  /** Per-owner global display order across all of the owner's tasks. */
  order?: number | null;
  description?: string | null;
  coverImageAssetId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  /** Returned by createTask only; use listTaskSteps for an existing task. */
  steps?: TaskStep[] | null;
}

export interface TaskStep {
  stepId: string;
  taskId: string;
  order: number;
  text: string;
  description?: string | null;
  mediaAssets: MediaAsset[];
  createdAt: string;
  updatedAt?: string | null;
}

/**
 * The schedule rule binding a Task template to a user. ONE_TIME uses
 * scheduledFor + timezone; RECURRING uses scheduleRule (an RRULE) + startDate +
 * startTime + timezone (+ optional endDate).
 */
export interface TaskAssignment {
  assignmentId: string;
  taskId: string;
  userId: string;
  assignedBy?: string | null;
  scheduleType: TaskAssignmentScheduleType;
  scheduledFor?: string | null;
  scheduleRule?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  timezone: string;
  active: boolean;
  endedAt?: string | null;
  assignedAt: string;
  createdAt: string;
  updatedAt?: string | null;
}

/** One concrete occurrence of a scheduled assignment, with status + lifecycle timestamps. */
export interface TaskInstance {
  instanceId: string;
  assignmentId: string;
  taskId: string;
  userId: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledFor: string;
  timezone: string;
  status: TaskInstanceStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  skippedAt?: string | null;
  cancelledAt?: string | null;
  activeStepId?: string | null;
  activeStepStartedAt?: string | null;
  activeDurationSeconds: number;
  elapsedSeconds?: number | null;
  isException?: boolean | null;
  createdAt: string;
  updatedAt?: string | null;
}

/**
 * A calendar cell from getTaskInstanceViews: a real TaskInstance overlaid on its
 * scheduled slot, or a VIRTUAL occurrence with no real instance yet
 * (isVirtual:true, instanceId:null).
 */
export interface TaskInstanceView {
  instanceId?: string | null;
  assignmentId: string;
  taskId: string;
  userId: string;
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledFor: string;
  timezone: string;
  status: TaskInstanceStatus;
  isVirtual: boolean;
  isException: boolean;
}

/** An immutable snapshot of one TaskStep captured into a TaskInstance when started. */
export interface TaskInstanceStep {
  instanceId: string;
  assignmentId: string;
  taskId: string;
  stepId: string;
  order: number;
  text: string;
  completed: boolean;
  completedAt?: string | null;
  firstStartedAt?: string | null;
  lastStartedAt?: string | null;
  activeDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInstanceTimingResult {
  instance: TaskInstance;
  activeStep?: TaskInstanceStep | null;
  previousStep?: TaskInstanceStep | null;
}

export interface MediaAsset {
  assetId: string;
  taskId: string;
  stepId?: string | null;
  s3Key: string;
  type: MediaType;
  mimeType: string;
  ownerId: string;
  size?: number | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface MediaUploadTarget {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

export interface MediaDownloadTarget {
  downloadUrl: string;
  s3Key: string;
  expiresIn: number;
}

export interface Citation {
  chunkId: string;
  title: string;
  url?: string | null;
  snippet?: string | null;
}

export interface GeneratedStep {
  text: string;
  citations: Citation[];
}

export interface TaskStepsResponse {
  steps: GeneratedStep[];
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface GeneratedAiTaskStep {
  text: string;
  citations: Citation[];
}

export interface GeneratedAiTask {
  title: string;
  steps: GeneratedAiTaskStep[];
  grounded: boolean;
  source: AiTaskGenerationSource;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface Report {
  reportId: string;
  scope?: JsonValue | null;
  dateRange?: JsonValue | null;
  s3Key?: string | null;
  createdBy?: string | null;
  createdAt: string;
  narrative?: string | null;
  stats?: JsonValue | null;
}

export interface GeneratedReport {
  draftToken: string;
  scope?: JsonValue | null;
  dateRange?: JsonValue | null;
  generatedAt: string;
  narrative: string;
  stats?: JsonValue | null;
}

export interface AdminUserResult {
  userId: string;
  email?: string | null;
  groups: string[];
  profile?: UserProfile | null;
}

export interface AdminDeleteUserResult {
  userId: string;
  deletedTasks: number;
  deletedUserItems: number;
  deletedSupportLinks: number;
  deletedCognitoUser: boolean;
}

export interface AdminUserData {
  userId: string;
  profile?: UserProfile | null;
  tasks: Task[];
  categories: Category[];
  taskAssignments: TaskAssignment[];
  supportLinks: SupportLink[];
}

export interface AdminDeleteOrganizationResult {
  organization: Organization;
  removedUsers: number;
}

export interface TaskInstanceLookupResult {
  instanceId: string;
  item?: TaskInstance | null;
}

export interface Connection<T> {
  items: T[];
  nextToken?: string | null;
}

export interface PageInput {
  limit?: number;
  nextToken?: string;
}

export interface CreateMyUserProfileInput {
  displayName: string;
  organizationId?: string | null;
  accessibilitySettings?: JsonValue;
}

export interface UpdateMyUserProfileInput {
  displayName?: string;
  /**
   * Full replacement of the stored settings (not deep-merged by the API).
   * `null` clears the field; omitted leaves it unchanged.
   */
  accessibilitySettings?: JsonValue | null;
  organizationId?: string | null;
}

export interface SelectPrimaryUserInput {
  primaryUserId: string;
}

export interface UnselectPrimaryUserInput {
  primaryUserId: string;
}

export interface CreateCategoryInput {
  userId?: string | null;
  name: string;
  color?: string | null;
  sortOrder?: number | null;
}

export interface UpdateCategoryInput {
  userId?: string | null;
  categoryId: string;
  /** Omitted ⇒ unchanged. Rejected for the default category and for null. */
  name?: string;
  /** Omitted ⇒ unchanged; explicit null ⇒ cleared. */
  color?: string | null;
  /** Omitted ⇒ unchanged; explicit null ⇒ cleared. */
  sortOrder?: number | null;
}

export interface DeleteCategoryInput {
  userId?: string | null;
  categoryId: string;
}

export interface CreateTaskStepNestedInput {
  text: string;
  description?: string | null;
}

export interface CreateTaskInput {
  userId?: string | null;
  title: string;
  categoryId?: string | null;
  description?: string | null;
  steps?: CreateTaskStepNestedInput[] | null;
  coverImageS3Key?: string | null;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string | null;
  categoryId?: string | null;
  description?: string | null;
  coverImageS3Key?: string | null;
}

export interface CreateTaskStepInput {
  taskId: string;
  order: number;
  text: string;
  description?: string | null;
  media?: SetTaskStepMediaInput[] | null;
}

export interface SetTaskStepMediaInput {
  type: MediaType;
  assetId?: string | null;
}

export interface UpdateTaskStepInput {
  taskId: string;
  stepId: string;
  text?: string | null;
  description?: string | null;
  media?: SetTaskStepMediaInput[] | null;
}

export interface DeleteTaskStepInput {
  taskId: string;
  stepId: string;
}

export interface ReorderTaskStepInput {
  stepId: string;
  order: number;
}

export interface ReorderTaskStepsInput {
  taskId: string;
  steps: ReorderTaskStepInput[];
}

export interface TaskOrderInput {
  taskId: string;
  order: number;
}

export interface UpdateTaskOrderInput {
  userId?: string | null;
  tasks: TaskOrderInput[];
}

export interface CreateTaskAssignmentInput {
  taskId: string;
  userId: string;
  assignedBy?: string | null;
  scheduleType: TaskAssignmentScheduleType;
  /** ONE_TIME: the single occurrence's ISO datetime. */
  scheduledFor?: string | null;
  /** RECURRING: an RRULE string (FREQ required: DAILY/WEEKLY/MONTHLY/YEARLY). */
  scheduleRule?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  timezone: string;
}

export interface StartTaskInstanceInput {
  userId: string;
  assignmentId: string;
  scheduledDate: string;
  scheduledTime: string;
}

export interface UpdateTaskInstanceStatusInput {
  userId: string;
  instanceId: string;
  status: PersistedTaskInstanceStatus;
}

export interface SetTaskInstanceStepCompletionInput {
  userId: string;
  instanceId: string;
  stepId: string;
  completed: boolean;
}

export interface StartTaskInstanceStepInput {
  userId: string;
  instanceId: string;
  stepId: string;
}

export interface PauseTaskInstanceTimerInput {
  userId: string;
  instanceId: string;
}

export interface CancelTaskInstanceInput {
  userId: string;
  assignmentId: string;
  scheduledDate: string;
  scheduledTime: string;
}

export interface EndTaskAssignmentInput {
  userId: string;
  assignmentId: string;
  effectiveDate: string;
}

export interface DeleteTaskAssignmentInput {
  userId: string;
  assignmentId: string;
}

export interface CreateMediaAssetInput {
  taskId: string;
  s3Key: string;
  type: MediaType;
  mimeType: string;
  ownerId?: string | null;
  size?: number | null;
}

export interface CreateMediaUploadUrlInput {
  taskId: string;
  contentType: string;
  fileName?: string | null;
}

export interface CreateTaskCoverImageUploadUrlInput {
  contentType: string;
  fileName?: string | null;
}

export interface DeleteMediaAssetInput {
  taskId: string;
  assetId: string;
}

export interface GenerateTaskStepsInput {
  userId: string;
  query: string;
  context?: {
    role?: string | null;
    organizationId?: string | null;
  } | null;
}

export interface CreateAiTaskInput {
  query: string;
  groundingMode?: AiTaskGroundingMode | null;
  stepCount?: number | null;
}

export interface GenerateReportInput {
  userId: string;
  from: string;
  to: string;
}

export interface SaveReportInput {
  draftToken: string;
  scope: JsonValue;
  dateRange: JsonValue;
  generatedAt: string;
  narrative: string;
  stats: JsonValue;
}

export interface InviteUserInput {
  email: string;
  displayName?: string | null;
  organizationId?: string | null;
}

export interface SetUserBaseRoleInput {
  userId: string;
  role: AdminBaseRole;
}

export interface SetSystemAdminInput {
  userId: string;
  enabled: boolean;
}

export interface AdminDeleteUserInput {
  userId: string;
  deleteCognitoUser?: boolean | null;
  disableFirst?: boolean | null;
}

export interface CreateOrganizationInput {
  name: string;
}

export interface UpdateOrganizationInput {
  organizationId: string;
  name: string;
}

export interface DeleteOrganizationInput {
  organizationId: string;
}

export interface AdminSetUserOrganizationInput {
  userId: string;
  organizationId?: string | null;
}
