import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/query/queryKeys';
import {
  getUserProfile,
  listAllUsers,
  listMyOrganizationUsers,
  listMySupportList,
  selectPrimaryUser,
  unselectPrimaryUser,
} from '../api/userApi';
import type {
  SelectPrimaryUserInput,
  UnselectPrimaryUserInput,
} from '../../../shared/api/canplanTypes';

/** Fetches any profile by id. Use `useMyProfile` for the signed-in caller. */
export function useUserProfile(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.profile(userId),
    queryFn: () => getUserProfile(userId),
    enabled: enabled && Boolean(userId),
  });
}

/** Paginated organization roster. Roster projections can have nullable fields. */
export function useMyOrganizationUsers(limit = 50, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.myOrganization(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMyOrganizationUsers({ limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
  });
}

/** Paginated support list for the signed-in supporter. */
export function useMySupportList(limit = 50, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.mySupportList(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMySupportList({ limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
  });
}

/** Selects a primary user for the signed-in support person. */
export function useSelectPrimaryUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SelectPrimaryUserInput) => selectPrimaryUser(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** Revokes a selected primary user for the signed-in support person. */
export function useUnselectPrimaryUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UnselectPrimaryUserInput) => unselectPrimaryUser(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** SystemAdmin-only paginated user listing. */
export function useAllUsers(limit = 50, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.all(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listAllUsers({ limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
  });
}
