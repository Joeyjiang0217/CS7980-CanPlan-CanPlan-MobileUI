import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/query/queryKeys';
import {
  getUserProfile,
  listAllUsers,
  listMyOrganizationUsers,
  listMySupportList,
  listUsersByOrganization,
  selectPrimaryUser,
  unselectPrimaryUser,
} from '../api/userApi';

/** Fetches any profile by id. Use `useMyProfile` for the signed-in caller. */
export function useUserProfile(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.profile(userId),
    queryFn: () => getUserProfile(userId),
    enabled: enabled && Boolean(userId),
  });
}

/** Paginated organization roster. Roster projections can have nullable fields. */
export function useUsersByOrganization(organizationId: string, limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.organization(organizationId, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listUsersByOrganization(organizationId, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled: Boolean(organizationId),
  });
}

/** Primary users the signed-in supporter currently has an effective link to. */
export function useMySupportList(enabled = true, limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.supportList(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMySupportList({ limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
  });
}

/** Members of the signed-in caller's organization (find primary users to link). */
export function useMyOrganizationUsers(enabled = true, limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.organizationUsers(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMyOrganizationUsers({ limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
  });
}

/** Establish/restore the caller's link to a primary user; refreshes the support list. */
export function useSelectPrimaryUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (primaryUserId: string) => selectPrimaryUser(primaryUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** Soft-revoke the caller's link to a primary user; refreshes the support list. */
export function useUnselectPrimaryUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (primaryUserId: string) => unselectPrimaryUser(primaryUserId),
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
