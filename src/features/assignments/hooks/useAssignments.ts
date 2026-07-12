import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CancelTaskInstanceInput,
  CreateTaskAssignmentInput,
  DeleteTaskAssignmentInput,
  EndTaskAssignmentInput,
  PauseTaskInstanceTimerInput,
  SetTaskInstanceStepCompletionInput,
  StartTaskInstanceInput,
  StartTaskInstanceStepInput,
  UpdateTaskInstanceStatusInput,
} from '../../../shared/api/canplanTypes';
import { requestTaskReminderResync } from '../../notifications/taskReminders';
import { queryKeys } from '../../../shared/query/queryKeys';
import {
  cancelTaskInstance,
  createTaskAssignment,
  deleteTaskAssignment,
  endTaskAssignment,
  getTaskInstance,
  getTaskInstanceViews,
  listTaskInstances,
  listMyAssignments,
  listTaskAssignmentsForUser,
  listTaskInstanceSteps,
  pauseTaskInstanceTimer,
  setTaskInstanceStepCompletion,
  startTaskInstance,
  startTaskInstanceStep,
  updateTaskInstanceStatus,
} from '../api/assignmentApi';

/** Paginated task assignments for a user. Use the caller's Cognito sub for self-scoped use. */
export function useAssignmentsForUser(userId: string, limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.assignments.user(userId, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listTaskAssignmentsForUser(userId, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled: Boolean(userId),
  });
}

/** Paginated task assignments for the signed-in user, scoped to the Cognito sub. */
export function useMyAssignments(limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.assignments.mine(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMyAssignments({ limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
  });
}

/**
 * The calendar feed over [startDate, endDate] (both YYYY-MM-DD): active
 * assignments' virtual occurrences overlaid with any real TaskInstance rows.
 */
export function useTaskInstanceViews(userId: string, startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.assignments.instanceViews(userId, startDate, endDate),
    queryFn: () => getTaskInstanceViews(userId, startDate, endDate),
    enabled: Boolean(userId) && Boolean(startDate) && Boolean(endDate),
  });
}

/** Ordered step snapshots for one materialized task instance. */
export function useInstanceSteps(userId: string, instanceId: string, limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.assignments.instanceSteps(userId, instanceId, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listTaskInstanceSteps(userId, instanceId, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled: Boolean(userId) && Boolean(instanceId),
  });
}

/** Reads one materialized task instance owned by the signed-in user. */
export function useTaskInstance(instanceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.assignments.instance(instanceId),
    queryFn: () => getTaskInstance(instanceId),
    enabled: enabled && Boolean(instanceId),
    // Carries live timing fields (activeDurationSeconds/activeStepStartedAt),
    // so always refetch on mount instead of serving the 5-minute-stale cache.
    staleTime: 0,
  });
}

/** Paginated real/materialized task instances for the signed-in user. */
export function useTaskInstances(startDate: string, endDate: string, limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.assignments.instances(startDate, endDate, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listTaskInstances(startDate, endDate, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled: Boolean(startDate) && Boolean(endDate),
  });
}

function useAssignmentMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation<TResult, Error, TInput>({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      // Any assignment/instance change can invalidate pending local reminders
      // (complete/skip drops one, create/end/delete reshapes the window).
      requestTaskReminderResync();
    },
  });
}

export function useCreateAssignment() {
  return useAssignmentMutation((input: CreateTaskAssignmentInput) =>
    createTaskAssignment(input),
  );
}

export function useStartTaskInstance() {
  return useAssignmentMutation((input: StartTaskInstanceInput) =>
    startTaskInstance(input),
  );
}

export function useUpdateInstanceStatus() {
  return useAssignmentMutation((input: UpdateTaskInstanceStatusInput) =>
    updateTaskInstanceStatus(input),
  );
}

export function useSetInstanceStepCompletion() {
  return useAssignmentMutation((input: SetTaskInstanceStepCompletionInput) =>
    setTaskInstanceStepCompletion(input),
  );
}

export function useStartTaskInstanceStep() {
  return useAssignmentMutation((input: StartTaskInstanceStepInput) =>
    startTaskInstanceStep(input),
  );
}

export function usePauseTaskInstanceTimer() {
  return useAssignmentMutation((input: PauseTaskInstanceTimerInput) =>
    pauseTaskInstanceTimer(input),
  );
}

export function useCancelTaskInstance() {
  return useAssignmentMutation((input: CancelTaskInstanceInput) =>
    cancelTaskInstance(input),
  );
}

export function useEndAssignment() {
  return useAssignmentMutation((input: EndTaskAssignmentInput) =>
    endTaskAssignment(input),
  );
}

export function useDeleteAssignment() {
  return useAssignmentMutation((input: DeleteTaskAssignmentInput) =>
    deleteTaskAssignment(input),
  );
}
