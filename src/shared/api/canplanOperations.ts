/** GraphQL documents for the CanPlan schema dated 2026-06-22. */

const USER_PROFILE_FIELDS = /* GraphQL */ `
  userId role displayName email organizationId accessibilitySettings defaultCategoryId createdAt updatedAt
`;

const SUPPORT_LINK_FIELDS = /* GraphQL */ `
  supporterId primaryUserId userId status permissions createdAt updatedAt
`;

const CATEGORY_FIELDS = /* GraphQL */ `
  categoryId ownerId name color sortOrder isDefault createdAt updatedAt
`;

const MEDIA_ASSET_FIELDS = /* GraphQL */ `
  assetId taskId stepId s3Key type mimeType ownerId size createdAt updatedAt
`;

const TASK_STEP_FIELDS = /* GraphQL */ `
  stepId taskId order text description mediaAssets { ${MEDIA_ASSET_FIELDS} } createdAt updatedAt
`;

const TASK_FIELDS = /* GraphQL */ `
  taskId ownerId title categoryId description scheduleRule
  schedule { repeatEvery repeatUnit firstOccurrenceAt timezone enabled }
  nextOccurrenceAt notificationEnabled coverImageAssetId createdAt updatedAt
`;

const ASSIGNMENT_FIELDS = /* GraphQL */ `
  assignmentId taskId userId assignedBy dueDate recurrence scheduleRule status assignedAt createdAt updatedAt
`;

const ASSIGNMENT_STEP_FIELDS = /* GraphQL */ `
  assignmentId taskId stepId order text completed completedAt createdAt updatedAt
`;

export const HEALTH_CHECK = /* GraphQL */ `
  query HealthCheck { healthCheck }
`;

export const GET_USER_PROFILE = /* GraphQL */ `
  query GetUserProfile($userId: ID!) {
    getUserProfile(userId: $userId) { ${USER_PROFILE_FIELDS} }
  }
`;

export const LIST_USERS_BY_ORGANIZATION = /* GraphQL */ `
  query ListUsersByOrganization($organizationId: ID!, $limit: Int, $nextToken: String) {
    listUsersByOrganization(organizationId: $organizationId, limit: $limit, nextToken: $nextToken) {
      items { ${USER_PROFILE_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_PRIMARY_USERS_BY_SUPPORTER = /* GraphQL */ `
  query ListPrimaryUsersBySupporter($supporterId: ID!, $limit: Int, $nextToken: String) {
    listPrimaryUsersBySupporter(supporterId: $supporterId, limit: $limit, nextToken: $nextToken) {
      items { ${SUPPORT_LINK_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_MY_CATEGORIES = /* GraphQL */ `
  query ListMyCategories($limit: Int, $nextToken: String) {
    listMyCategories(limit: $limit, nextToken: $nextToken) {
      items { ${CATEGORY_FIELDS} }
      nextToken
    }
  }
`;

export const GET_TASK = /* GraphQL */ `
  query GetTask($taskId: ID!) {
    getTask(taskId: $taskId) { ${TASK_FIELDS} }
  }
`;

export const LIST_TASK_STEPS = /* GraphQL */ `
  query ListTaskSteps($taskId: ID!, $limit: Int, $nextToken: String) {
    listTaskSteps(taskId: $taskId, limit: $limit, nextToken: $nextToken) {
      items { ${TASK_STEP_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_TASKS_BY_OWNER = /* GraphQL */ `
  query ListTasksByOwner($ownerId: ID!, $limit: Int, $nextToken: String) {
    listTasksByOwner(ownerId: $ownerId, limit: $limit, nextToken: $nextToken) {
      items { ${TASK_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_TASKS_BY_CATEGORY = /* GraphQL */ `
  query ListTasksByCategory($ownerId: ID!, $categoryId: ID!, $limit: Int, $nextToken: String) {
    listTasksByCategory(ownerId: $ownerId, categoryId: $categoryId, limit: $limit, nextToken: $nextToken) {
      items { ${TASK_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_ASSIGNMENTS_FOR_USER = /* GraphQL */ `
  query ListAssignmentsForUser($userId: ID!, $limit: Int, $nextToken: String) {
    listAssignmentsForUser(userId: $userId, limit: $limit, nextToken: $nextToken) {
      items { ${ASSIGNMENT_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_ASSIGNMENT_STEPS = /* GraphQL */ `
  query ListAssignmentSteps($userId: ID!, $assignmentId: ID!, $limit: Int, $nextToken: String) {
    listAssignmentSteps(userId: $userId, assignmentId: $assignmentId, limit: $limit, nextToken: $nextToken) {
      items { ${ASSIGNMENT_STEP_FIELDS} }
      nextToken
    }
  }
`;

export const GET_MEDIA_DOWNLOAD_URL = /* GraphQL */ `
  query GetMediaDownloadUrl($taskId: ID!, $assetId: ID!) {
    getMediaDownloadUrl(taskId: $taskId, assetId: $assetId) { downloadUrl s3Key expiresIn }
  }
`;

export const LIST_MEDIA_FOR_TASK = /* GraphQL */ `
  query ListMediaForTask($taskId: ID!, $limit: Int, $nextToken: String) {
    listMediaForTask(taskId: $taskId, limit: $limit, nextToken: $nextToken) {
      items { ${MEDIA_ASSET_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_ALL_USERS = /* GraphQL */ `
  query ListAllUsers($limit: Int, $nextToken: String) {
    listAllUsers(limit: $limit, nextToken: $nextToken) {
      items { ${USER_PROFILE_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_ALL_TASKS = /* GraphQL */ `
  query ListAllTasks($limit: Int, $nextToken: String) {
    listAllTasks(limit: $limit, nextToken: $nextToken) {
      items { ${TASK_FIELDS} }
      nextToken
    }
  }
`;

export const CREATE_USER_PROFILE = /* GraphQL */ `
  mutation CreateUserProfile($input: CreateMyUserProfileInput!) {
    createUserProfile(input: $input) { ${USER_PROFILE_FIELDS} }
  }
`;

export const UPDATE_MY_USER_PROFILE = /* GraphQL */ `
  mutation UpdateMyUserProfile($input: UpdateMyUserProfileInput!) {
    updateMyUserProfile(input: $input) { ${USER_PROFILE_FIELDS} }
  }
`;

export const CREATE_SUPPORT_LINK = /* GraphQL */ `
  mutation CreateSupportLink($input: CreateSupportLinkInput!) {
    createSupportLink(input: $input) { ${SUPPORT_LINK_FIELDS} }
  }
`;

export const CREATE_CATEGORY = /* GraphQL */ `
  mutation CreateCategory($input: CreateCategoryInput!) {
    createCategory(input: $input) { ${CATEGORY_FIELDS} }
  }
`;

export const UPDATE_CATEGORY = /* GraphQL */ `
  mutation UpdateCategory($input: UpdateCategoryInput!) {
    updateCategory(input: $input) { ${CATEGORY_FIELDS} }
  }
`;

export const DELETE_CATEGORY = /* GraphQL */ `
  mutation DeleteCategory($input: DeleteCategoryInput!) {
    deleteCategory(input: $input) { ${CATEGORY_FIELDS} }
  }
`;

export const CREATE_TASK = /* GraphQL */ `
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      ${TASK_FIELDS}
      steps { ${TASK_STEP_FIELDS} }
    }
  }
`;

export const UPDATE_TASK = /* GraphQL */ `
  mutation UpdateTask($input: UpdateTaskInput!) {
    updateTask(input: $input) { ${TASK_FIELDS} }
  }
`;

export const CREATE_TASK_STEP = /* GraphQL */ `
  mutation CreateTaskStep($input: CreateTaskStepInput!) {
    createTaskStep(input: $input) { ${TASK_STEP_FIELDS} }
  }
`;

export const UPDATE_TASK_STEP = /* GraphQL */ `
  mutation UpdateTaskStep($input: UpdateTaskStepInput!) {
    updateTaskStep(input: $input) { ${TASK_STEP_FIELDS} }
  }
`;

export const DELETE_TASK_STEP = /* GraphQL */ `
  mutation DeleteTaskStep($input: DeleteTaskStepInput!) {
    deleteTaskStep(input: $input) { ${TASK_STEP_FIELDS} }
  }
`;

export const REORDER_TASK_STEPS = /* GraphQL */ `
  mutation ReorderTaskSteps($input: ReorderTaskStepsInput!) {
    reorderTaskSteps(input: $input) { ${TASK_STEP_FIELDS} }
  }
`;

export const DELETE_TASK = /* GraphQL */ `
  mutation DeleteTask($taskId: ID!) {
    deleteTask(taskId: $taskId) { ${TASK_FIELDS} }
  }
`;

export const CREATE_ASSIGNMENT = /* GraphQL */ `
  mutation CreateAssignment($input: CreateAssignmentInput!) {
    createAssignment(input: $input) { ${ASSIGNMENT_FIELDS} }
  }
`;

export const UPDATE_ASSIGNMENT_STATUS = /* GraphQL */ `
  mutation UpdateAssignmentStatus($input: UpdateAssignmentStatusInput!) {
    updateAssignmentStatus(input: $input) { ${ASSIGNMENT_FIELDS} }
  }
`;

export const SET_ASSIGNMENT_STEP_COMPLETION = /* GraphQL */ `
  mutation SetAssignmentStepCompletion($input: SetAssignmentStepCompletionInput!) {
    setAssignmentStepCompletion(input: $input) { ${ASSIGNMENT_STEP_FIELDS} }
  }
`;

export const DELETE_ASSIGNMENT = /* GraphQL */ `
  mutation DeleteAssignment($input: DeleteAssignmentInput!) {
    deleteAssignment(input: $input) { ${ASSIGNMENT_FIELDS} }
  }
`;

export const CREATE_MEDIA_UPLOAD_URL = /* GraphQL */ `
  mutation CreateMediaUploadUrl($input: CreateMediaUploadUrlInput!) {
    createMediaUploadUrl(input: $input) { uploadUrl s3Key expiresIn }
  }
`;

export const CREATE_MEDIA_ASSET = /* GraphQL */ `
  mutation CreateMediaAsset($input: CreateMediaAssetInput!) {
    createMediaAsset(input: $input) { ${MEDIA_ASSET_FIELDS} }
  }
`;

export const CREATE_TASK_COVER_IMAGE_UPLOAD_URL = /* GraphQL */ `
  mutation CreateTaskCoverImageUploadUrl($input: CreateTaskCoverImageUploadUrlInput!) {
    createTaskCoverImageUploadUrl(input: $input) { uploadUrl s3Key expiresIn }
  }
`;

export const DELETE_MEDIA_ASSET = /* GraphQL */ `
  mutation DeleteMediaAsset($input: DeleteMediaAssetInput!) {
    deleteMediaAsset(input: $input) { ${MEDIA_ASSET_FIELDS} }
  }
`;

export const GENERATE_TASK_STEPS = /* GraphQL */ `
  mutation GenerateTaskSteps($input: GenerateTaskStepsInput!) {
    generateTaskSteps(input: $input) {
      steps { text citations { chunkId title url snippet } }
      model inputTokens outputTokens
    }
  }
`;

export const CREATE_AI_TASK = /* GraphQL */ `
  mutation CreateAiTask($input: CreateAiTaskInput!) {
    createAiTask(input: $input) {
      title
      steps { text }
      grounded source inputTokens outputTokens
    }
  }
`;
