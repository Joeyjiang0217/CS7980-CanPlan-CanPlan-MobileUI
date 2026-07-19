/**
 * Centralized TanStack Query keys.
 *
 * Every query/mutation hook references these so cache reads, invalidations, and
 * future mutations stay consistent. Keys are declared `as const` so they are
 * inferred as readonly tuples.
 */
export const queryKeys = {
  auth: {
    currentUser: ['auth', 'currentUser'] as const,
  },
  users: {
    myProfile: ['users', 'myProfile'] as const,
    profile: (userId: string) => ['users', 'profile', userId] as const,
    organization: (organizationId: string, limit?: number) =>
      ['users', 'organization', organizationId, limit] as const,
    supportList: (limit?: number) => ['users', 'supportList', limit] as const,
    organizationUsers: (limit?: number) =>
      ['users', 'organizationUsers', limit] as const,
    all: (limit?: number) => ['users', 'all', limit] as const,
  },
  categories: {
    all: ['categories'] as const,
    // `userId` scopes the cache to a delegated primary user; 'self' for the caller.
    mine: (userId?: string, limit?: number) =>
      ['categories', 'mine', userId ?? 'self', limit] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
    steps: (taskId: string, limit?: number) =>
      ['tasks', 'steps', taskId, limit] as const,
    owner: (ownerId: string, limit?: number) =>
      ['tasks', 'owner', ownerId, limit] as const,
    category: (ownerId: string, categoryId: string, limit?: number) =>
      ['tasks', 'category', ownerId, categoryId, limit] as const,
    allAdmin: (limit?: number) => ['tasks', 'allAdmin', limit] as const,
  },
  assignments: {
    all: ['assignments'] as const,
    mine: (limit?: number) => ['assignments', 'mine', limit] as const,
    user: (userId: string, limit?: number) =>
      ['assignments', 'user', userId, limit] as const,
    steps: (userId: string, assignmentId: string, limit?: number) =>
      ['assignments', 'steps', userId, assignmentId, limit] as const,
  },
  media: {
    all: ['media'] as const,
    task: (taskId: string, limit?: number) =>
      ['media', 'task', taskId, limit] as const,
    download: (taskId: string, assetId: string) =>
      ['media', 'download', taskId, assetId] as const,
  },
  ai: {
    taskSteps: ['ai', 'taskSteps'] as const,
  },
  reports: {
    all: ['reports'] as const,
    list: (userId: string, limit?: number) =>
      ['reports', 'list', userId, limit] as const,
    document: (userId: string, reportId: string) =>
      ['reports', 'document', userId, reportId] as const,
    linkedPrimaryUsers: (supporterId: string) =>
      ['reports', 'linkedPrimaryUsers', supporterId] as const,
  },
};
