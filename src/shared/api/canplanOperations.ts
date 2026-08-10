/** GraphQL documents for the CanPlan schema. */

const USER_PROFILE_FIELDS = /* GraphQL */ `
  userId role displayName email organizationId accessibilitySettings defaultCategoryId createdAt updatedAt
`;

const SUPPORT_LINK_FIELDS = /* GraphQL */ `
  supporterId primaryUserId userId status createdAt updatedAt
`;

const ORGANIZATION_FIELDS = /* GraphQL */ `
  organizationId name createdAt updatedAt
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
  taskId ownerId title categoryId order description coverImageAssetId createdAt updatedAt
`;

const TASK_ASSIGNMENT_FIELDS = /* GraphQL */ `
  assignmentId taskId userId assignedBy scheduleType scheduledFor scheduleRule
  startDate endDate startTime timezone active endedAt assignedAt createdAt updatedAt
`;

const TASK_INSTANCE_FIELDS = /* GraphQL */ `
  instanceId assignmentId taskId userId scheduledDate scheduledTime scheduledFor timezone
  status startedAt completedAt skippedAt cancelledAt activeStepId activeStepStartedAt
  activeDurationSeconds elapsedSeconds isException createdAt updatedAt
`;

const TASK_INSTANCE_STEP_FIELDS = /* GraphQL */ `
  instanceId assignmentId taskId stepId order text completed completedAt firstStartedAt
  lastStartedAt activeDurationSeconds createdAt updatedAt
`;

const TASK_INSTANCE_VIEW_FIELDS = /* GraphQL */ `
  instanceId assignmentId taskId userId title scheduledDate scheduledTime scheduledFor
  timezone status isVirtual isException
`;

const REPORT_FIELDS = /* GraphQL */ `
  reportId scope dateRange s3Key createdBy createdAt
`;

const ADMIN_USER_RESULT_FIELDS = /* GraphQL */ `
  userId email groups profile { ${USER_PROFILE_FIELDS} }
`;

const ADMIN_DELETE_USER_RESULT_FIELDS = /* GraphQL */ `
  userId deletedTasks deletedUserItems deletedSupportLinks deletedCognitoUser
`;

export const HEALTH_CHECK = /* GraphQL */ `
  query HealthCheck { healthCheck }
`;

export const GET_USER_PROFILE = /* GraphQL */ `
  query GetUserProfile($userId: ID!) {
    getUserProfile(userId: $userId) { ${USER_PROFILE_FIELDS} }
  }
`;

export const LIST_MY_ORGANIZATION_USERS = /* GraphQL */ `
  query ListMyOrganizationUsers($limit: Int, $nextToken: String) {
    listMyOrganizationUsers(limit: $limit, nextToken: $nextToken) {
      items { ${USER_PROFILE_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_MY_SUPPORT_LIST = /* GraphQL */ `
  query ListMySupportList($limit: Int, $nextToken: String) {
    listMySupportList(limit: $limit, nextToken: $nextToken) {
      items { ${SUPPORT_LINK_FIELDS} }
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
  query ListMyCategories($userId: ID, $limit: Int, $nextToken: String) {
    listMyCategories(userId: $userId, limit: $limit, nextToken: $nextToken) {
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

export const LIST_TASK_ASSIGNMENTS_FOR_USER = /* GraphQL */ `
  query ListTaskAssignmentsForUser($userId: ID!, $limit: Int, $nextToken: String) {
    listTaskAssignmentsForUser(userId: $userId, limit: $limit, nextToken: $nextToken) {
      items { ${TASK_ASSIGNMENT_FIELDS} }
      nextToken
    }
  }
`;

export const GET_TASK_INSTANCE_VIEWS = /* GraphQL */ `
  query GetTaskInstanceViews($userId: ID!, $startDate: String!, $endDate: String!) {
    getTaskInstanceViews(userId: $userId, startDate: $startDate, endDate: $endDate) {
      items { ${TASK_INSTANCE_VIEW_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_TASK_INSTANCE_STEPS = /* GraphQL */ `
  query ListTaskInstanceSteps($userId: ID!, $instanceId: ID!, $limit: Int, $nextToken: String) {
    listTaskInstanceSteps(userId: $userId, instanceId: $instanceId, limit: $limit, nextToken: $nextToken) {
      items { ${TASK_INSTANCE_STEP_FIELDS} }
      nextToken
    }
  }
`;

export const GET_TASK_INSTANCE = /* GraphQL */ `
  query GetTaskInstance($instanceId: ID!) {
    getTaskInstance(instanceId: $instanceId) { ${TASK_INSTANCE_FIELDS} }
  }
`;

export const LIST_TASK_INSTANCES = /* GraphQL */ `
  query ListTaskInstances($startDate: String!, $endDate: String!, $limit: Int, $nextToken: String) {
    listTaskInstances(startDate: $startDate, endDate: $endDate, limit: $limit, nextToken: $nextToken) {
      items { ${TASK_INSTANCE_FIELDS} }
      nextToken
    }
  }
`;

export const BATCH_GET_TASK_INSTANCES = /* GraphQL */ `
  query BatchGetTaskInstances($instanceIds: [ID!]!) {
    batchGetTaskInstances(instanceIds: $instanceIds) {
      instanceId
      item { ${TASK_INSTANCE_FIELDS} }
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

export const ADMIN_GET_USER_DATA = /* GraphQL */ `
  query AdminGetUserData($userId: ID!) {
    adminGetUserData(userId: $userId) {
      userId
      profile { ${USER_PROFILE_FIELDS} }
      tasks { ${TASK_FIELDS} }
      categories { ${CATEGORY_FIELDS} }
      taskAssignments { ${TASK_ASSIGNMENT_FIELDS} }
      supportLinks { ${SUPPORT_LINK_FIELDS} }
    }
  }
`;

export const LIST_ALL_ORGANIZATIONS = /* GraphQL */ `
  query ListAllOrganizations($limit: Int, $nextToken: String) {
    listAllOrganizations(limit: $limit, nextToken: $nextToken) {
      items { ${ORGANIZATION_FIELDS} }
      nextToken
    }
  }
`;

export const ADMIN_LIST_ORGANIZATION_USERS = /* GraphQL */ `
  query AdminListOrganizationUsers($organizationId: ID!, $limit: Int, $nextToken: String) {
    adminListOrganizationUsers(organizationId: $organizationId, limit: $limit, nextToken: $nextToken) {
      items { ${USER_PROFILE_FIELDS} }
      nextToken
    }
  }
`;

export const LIST_REPORTS = /* GraphQL */ `
  query ListReports($userId: ID!, $limit: Int, $nextToken: String) {
    listReports(userId: $userId, limit: $limit, nextToken: $nextToken) {
      items { ${REPORT_FIELDS} }
      nextToken
    }
  }
`;

export const GET_REPORT_DOWNLOAD_URL = /* GraphQL */ `
  query GetReportDownloadUrl($userId: ID!, $reportId: ID!) {
    getReportDownloadUrl(userId: $userId, reportId: $reportId) { downloadUrl s3Key expiresIn }
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

export const SELECT_PRIMARY_USER = /* GraphQL */ `
  mutation SelectPrimaryUser($input: SelectPrimaryUserInput!) {
    selectPrimaryUser(input: $input) { ${SUPPORT_LINK_FIELDS} }
  }
`;

export const UNSELECT_PRIMARY_USER = /* GraphQL */ `
  mutation UnselectPrimaryUser($input: UnselectPrimaryUserInput!) {
    unselectPrimaryUser(input: $input) { ${SUPPORT_LINK_FIELDS} }
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

export const CREATE_AI_TASK = /* GraphQL */ `
  mutation CreateAiTask($input: CreateAiTaskInput!) {
    createAiTask(input: $input) {
      title
      steps { text }
      grounded source inputTokens outputTokens
    }
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

export const UPDATE_TASK_ORDER = /* GraphQL */ `
  mutation UpdateTaskOrder($input: UpdateTaskOrderInput!) {
    updateTaskOrder(input: $input) { ${TASK_FIELDS} }
  }
`;

export const DELETE_TASK = /* GraphQL */ `
  mutation DeleteTask($taskId: ID!) {
    deleteTask(taskId: $taskId) { ${TASK_FIELDS} }
  }
`;

export const CREATE_TASK_ASSIGNMENT = /* GraphQL */ `
  mutation CreateTaskAssignment($input: CreateTaskAssignmentInput!) {
    createTaskAssignment(input: $input) { ${TASK_ASSIGNMENT_FIELDS} }
  }
`;

export const START_TASK_INSTANCE = /* GraphQL */ `
  mutation StartTaskInstance($input: StartTaskInstanceInput!) {
    startTaskInstance(input: $input) { ${TASK_INSTANCE_FIELDS} }
  }
`;

export const UPDATE_TASK_INSTANCE_STATUS = /* GraphQL */ `
  mutation UpdateTaskInstanceStatus($input: UpdateTaskInstanceStatusInput!) {
    updateTaskInstanceStatus(input: $input) { ${TASK_INSTANCE_FIELDS} }
  }
`;

export const SET_TASK_INSTANCE_STEP_COMPLETION = /* GraphQL */ `
  mutation SetTaskInstanceStepCompletion($input: SetTaskInstanceStepCompletionInput!) {
    setTaskInstanceStepCompletion(input: $input) { ${TASK_INSTANCE_STEP_FIELDS} }
  }
`;

export const START_TASK_INSTANCE_STEP = /* GraphQL */ `
  mutation StartTaskInstanceStep($input: StartTaskInstanceStepInput!) {
    startTaskInstanceStep(input: $input) {
      instance { ${TASK_INSTANCE_FIELDS} }
      activeStep { ${TASK_INSTANCE_STEP_FIELDS} }
      previousStep { ${TASK_INSTANCE_STEP_FIELDS} }
    }
  }
`;

export const PAUSE_TASK_INSTANCE_TIMER = /* GraphQL */ `
  mutation PauseTaskInstanceTimer($input: PauseTaskInstanceTimerInput!) {
    pauseTaskInstanceTimer(input: $input) {
      instance { ${TASK_INSTANCE_FIELDS} }
      activeStep { ${TASK_INSTANCE_STEP_FIELDS} }
      previousStep { ${TASK_INSTANCE_STEP_FIELDS} }
    }
  }
`;

export const CANCEL_TASK_INSTANCE = /* GraphQL */ `
  mutation CancelTaskInstance($input: CancelTaskInstanceInput!) {
    cancelTaskInstance(input: $input) { ${TASK_INSTANCE_FIELDS} }
  }
`;

export const END_TASK_ASSIGNMENT = /* GraphQL */ `
  mutation EndTaskAssignment($input: EndTaskAssignmentInput!) {
    endTaskAssignment(input: $input) { ${TASK_ASSIGNMENT_FIELDS} }
  }
`;

export const DELETE_TASK_ASSIGNMENT = /* GraphQL */ `
  mutation DeleteTaskAssignment($input: DeleteTaskAssignmentInput!) {
    deleteTaskAssignment(input: $input) { ${TASK_ASSIGNMENT_FIELDS} }
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

export const GENERATE_REPORT = /* GraphQL */ `
  mutation GenerateReport($input: GenerateReportInput!) {
    generateReport(input: $input) {
      draftToken scope dateRange generatedAt narrative stats
    }
  }
`;

export const SAVE_REPORT = /* GraphQL */ `
  mutation SaveReport($input: SaveReportInput!) {
    saveReport(input: $input) { ${REPORT_FIELDS} }
  }
`;

export const INVITE_SUPPORT_PERSON = /* GraphQL */ `
  mutation InviteSupportPerson($input: InviteUserInput!) {
    inviteSupportPerson(input: $input) { ${ADMIN_USER_RESULT_FIELDS} }
  }
`;

export const INVITE_ORGANIZATION_ADMIN = /* GraphQL */ `
  mutation InviteOrganizationAdmin($input: InviteUserInput!) {
    inviteOrganizationAdmin(input: $input) { ${ADMIN_USER_RESULT_FIELDS} }
  }
`;

export const SET_USER_BASE_ROLE = /* GraphQL */ `
  mutation SetUserBaseRole($input: SetUserBaseRoleInput!) {
    setUserBaseRole(input: $input) { ${ADMIN_USER_RESULT_FIELDS} }
  }
`;

export const SET_SYSTEM_ADMIN = /* GraphQL */ `
  mutation SetSystemAdmin($input: SetSystemAdminInput!) {
    setSystemAdmin(input: $input) { ${ADMIN_USER_RESULT_FIELDS} }
  }
`;

export const ADMIN_DELETE_TASK = /* GraphQL */ `
  mutation AdminDeleteTask($taskId: ID!) {
    adminDeleteTask(taskId: $taskId) { ${TASK_FIELDS} }
  }
`;

export const ADMIN_DELETE_USER = /* GraphQL */ `
  mutation AdminDeleteUser($input: AdminDeleteUserInput!) {
    adminDeleteUser(input: $input) { ${ADMIN_DELETE_USER_RESULT_FIELDS} }
  }
`;

export const ADMIN_CREATE_ORGANIZATION = /* GraphQL */ `
  mutation AdminCreateOrganization($input: CreateOrganizationInput!) {
    adminCreateOrganization(input: $input) { ${ORGANIZATION_FIELDS} }
  }
`;

export const ADMIN_UPDATE_ORGANIZATION = /* GraphQL */ `
  mutation AdminUpdateOrganization($input: UpdateOrganizationInput!) {
    adminUpdateOrganization(input: $input) { ${ORGANIZATION_FIELDS} }
  }
`;

export const ADMIN_DELETE_ORGANIZATION = /* GraphQL */ `
  mutation AdminDeleteOrganization($input: DeleteOrganizationInput!) {
    adminDeleteOrganization(input: $input) {
      organization { ${ORGANIZATION_FIELDS} }
      removedUsers
    }
  }
`;

export const ADMIN_SET_USER_ORGANIZATION = /* GraphQL */ `
  mutation AdminSetUserOrganization($input: AdminSetUserOrganizationInput!) {
    adminSetUserOrganization(input: $input) { ${USER_PROFILE_FIELDS} }
  }
`;
