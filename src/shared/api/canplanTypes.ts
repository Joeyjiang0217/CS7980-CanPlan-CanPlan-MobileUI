/**
 * TypeScript contract for the CanPlan GraphQL schema (2026-06-22).
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
export type AssignmentStatus = 'TO_DO' | 'OVERDUE' | 'COMPLETED' | 'SKIPPED';
/** Values allowed by updateAssignmentStatus; OVERDUE is derived by the API. */
export type PersistedAssignmentStatus = Exclude<AssignmentStatus, 'OVERDUE'>;
export type MediaType = 'IMAGE' | 'AUDIO' | 'VIDEO';
export type RepeatUnit = 'MINUTE' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';

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
  permissions?: JsonValue | null;
  createdAt: string;
  updatedAt?: string | null;
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

export interface TaskSchedule {
  repeatEvery: number;
  repeatUnit: RepeatUnit;
  firstOccurrenceAt: string;
  timezone: string;
  enabled?: boolean | null;
}

export interface Task {
  taskId: string;
  ownerId: string;
  title: string;
  categoryId: string;
  description?: string | null;
  scheduleRule?: string | null;
  schedule?: TaskSchedule | null;
  nextOccurrenceAt?: string | null;
  notificationEnabled?: boolean | null;
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

export interface Assignment {
  assignmentId: string;
  taskId: string;
  userId: string;
  assignedBy?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  scheduleRule?: string | null;
  status: AssignmentStatus;
  assignedAt: string;
  createdAt: string;
  updatedAt?: string | null;
}

export interface AssignmentStep {
  assignmentId: string;
  taskId: string;
  stepId: string;
  order: number;
  text: string;
  completed: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
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

export type AiTaskGroundingMode = 'GROUNDED_ONLY' | 'ALLOW_UNGROUNDED_FALLBACK';

export type AiTaskGenerationSource = 'CORPUS' | 'UNGROUNDED_AI';

/**
 * Preview step from createAiTask. Citations exist on the wire but this app never
 * fetches them (primary users have cognitive disabilities; sources add load).
 */
export interface GeneratedAiTaskStep {
  text: string;
}

export interface GeneratedAiTask {
  title: string;
  steps: GeneratedAiTaskStep[];
  /** false = ungrounded fallback (source UNGROUNDED_AI); the UI shows an AI notice. */
  grounded: boolean;
  source: AiTaskGenerationSource;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface CreateAiTaskInput {
  query: string;
  /** Omitted ⇒ backend defaults to GROUNDED_ONLY; this app always sends ALLOW_UNGROUNDED_FALLBACK. */
  groundingMode?: AiTaskGroundingMode;
  /** Optional 1..20; this app never sends it (AI picks the count). */
  stepCount?: number;
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
}

export interface CreateSupportLinkInput {
  supporterId: string;
  primaryUserId: string;
  status?: SupportLinkStatus | null;
  permissions?: JsonValue;
}

export interface CreateCategoryInput {
  name: string;
  color?: string | null;
  sortOrder?: number | null;
}

export interface UpdateCategoryInput {
  categoryId: string;
  /** Omitted ⇒ unchanged. Rejected for the default category and for null. */
  name?: string;
  /** Omitted ⇒ unchanged; explicit null ⇒ cleared. */
  color?: string | null;
  /** Omitted ⇒ unchanged; explicit null ⇒ cleared. */
  sortOrder?: number | null;
}

export interface DeleteCategoryInput {
  categoryId: string;
}

export interface TaskScheduleInput {
  repeatEvery: number;
  repeatUnit: RepeatUnit;
  firstOccurrenceAt: string;
  timezone: string;
  enabled?: boolean | null;
}

export interface CreateTaskStepNestedInput {
  text: string;
  description?: string | null;
}

export interface CreateTaskInput {
  title: string;
  categoryId?: string | null;
  description?: string | null;
  scheduleRule?: string | null;
  steps?: CreateTaskStepNestedInput[] | null;
  schedule?: TaskScheduleInput | null;
  notificationEnabled?: boolean | null;
  coverImageS3Key?: string | null;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string | null;
  categoryId?: string | null;
  description?: string | null;
  scheduleRule?: string | null;
  schedule?: TaskScheduleInput | null;
  notificationEnabled?: boolean | null;
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

export interface CreateAssignmentInput {
  taskId: string;
  userId: string;
  assignedBy?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  scheduleRule?: string | null;
}

export interface UpdateAssignmentStatusInput {
  userId: string;
  assignmentId: string;
  status: PersistedAssignmentStatus;
}

export interface SetAssignmentStepCompletionInput {
  userId: string;
  assignmentId: string;
  stepId: string;
  completed: boolean;
}

export interface DeleteAssignmentInput {
  userId: string;
  assignmentId: string;
}

export interface CreateMediaAssetInput {
  taskId: string;
  s3Key: string;
  type: MediaType;
  mimeType: string;
  ownerId: string;
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
