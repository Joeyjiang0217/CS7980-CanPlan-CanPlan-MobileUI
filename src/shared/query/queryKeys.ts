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
    myOrganization: (limit?: number) =>
      ['users', 'myOrganization', limit] as const,
    mySupportList: (limit?: number) =>
      ['users', 'mySupportList', limit] as const,
    all: (limit?: number) => ['users', 'all', limit] as const,
  },
  categories: {
    all: ['categories'] as const,
    mine: (limit?: number) => ['categories', 'mine', limit] as const,
    user: (userId: string | null | undefined, limit?: number) =>
      ['categories', 'user', userId ?? 'self', limit] as const,
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
    instanceViews: (userId: string, startDate: string, endDate: string) =>
      ['assignments', 'instanceViews', userId, startDate, endDate] as const,
    instanceSteps: (userId: string, instanceId: string, limit?: number) =>
      ['assignments', 'instanceSteps', userId, instanceId, limit] as const,
    instance: (instanceId: string) =>
      ['assignments', 'instance', instanceId] as const,
    instances: (startDate: string, endDate: string, limit?: number) =>
      ['assignments', 'instances', startDate, endDate, limit] as const,
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
