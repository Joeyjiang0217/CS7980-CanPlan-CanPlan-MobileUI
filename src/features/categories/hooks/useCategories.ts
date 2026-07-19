import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  CreateCategoryInput,
  DeleteCategoryInput,
  UpdateCategoryInput,
} from '../../../shared/api/canplanTypes';
import { queryKeys } from '../../../shared/query/queryKeys';
import {
  createCategory,
  deleteCategory,
  listMyCategories,
  updateCategory,
} from '../api/categoryApi';

/**
 * Paginated category list. With no `userId` it returns the authenticated
 * caller's categories (incl. their real default); a SupportPerson may pass a
 * linked primary user's `userId` to read that user's categories (delegated).
 */
export function useMyCategories(enabled = true, limit = 50, userId?: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.categories.mine(userId, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMyCategories(userId, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
  });
}

/** Invalidate category and task caches — both move when a category changes. */
function invalidateCategoryCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategory(input),
    onSuccess: () => invalidateCategoryCaches(queryClient),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCategoryInput) => updateCategory(input),
    onSuccess: () => invalidateCategoryCaches(queryClient),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteCategoryInput) => deleteCategory(input),
    onSuccess: () => invalidateCategoryCaches(queryClient),
  });
}
