import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { canPlanApi } from '../../../shared/api/canplanApi';
import type {
  GenerateReportInput,
  SupportLink,
} from '../../../shared/api/canplanTypes';
import { queryKeys } from '../../../shared/query/queryKeys';
import { fetchReportDocument, generateReport, listReports } from '../api/reportApi';

/** Paginated report history for one cared-for user, newest first. */
export function useReports(userId: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: queryKeys.reports.list(userId, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listReports(userId, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled: Boolean(userId),
  });
}

/** Generates a report. Synchronous on the backend — can take tens of seconds. */
export function useGenerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    // Generate-and-persist in one backend call; returns the saved Report so
    // callers get a reportId to navigate to.
    mutationFn: (input: GenerateReportInput) => generateReport(input),
    onSuccess: (_report, input) => {
      // Prefix-invalidate every page-size variant of this user's report list.
      void queryClient.invalidateQueries({
        queryKey: ['reports', 'list', input.userId],
      });
    },
  });
}

/** Full report JSON from S3. Immutable once written — cache forever. */
export function useReportDocument(userId: string, reportId: string) {
  return useQuery({
    queryKey: queryKeys.reports.document(userId, reportId),
    queryFn: () => fetchReportDocument(userId, reportId),
    enabled: Boolean(userId) && Boolean(reportId),
    staleTime: Infinity,
  });
}

export interface LinkedPrimaryUser {
  userId: string;
  displayName: string | null;
}

/**
 * ACTIVE primary users linked to this supporter, with display names resolved
 * (SupportLink carries only ids). Pages through every link, then fetches
 * profiles in parallel; a missing profile degrades to displayName null.
 */
export function useLinkedPrimaryUsers(supporterId: string) {
  return useQuery({
    queryKey: queryKeys.reports.linkedPrimaryUsers(supporterId),
    enabled: Boolean(supporterId),
    queryFn: async (): Promise<LinkedPrimaryUser[]> => {
      const links: SupportLink[] = [];
      let nextToken: string | undefined;
      do {
        // Effective (currently-actionable) support links for the signed-in
        // supporter; the caller is derived server-side from the JWT.
        const page = await canPlanApi.listMySupportList({ limit: 50, nextToken });
        links.push(...page.items);
        nextToken = page.nextToken ?? undefined;
      } while (nextToken);

      const active = links.filter((link) => link.status === 'ACTIVE');
      const profiles = await Promise.all(
        active.map((link) =>
          canPlanApi.getUserProfile(link.primaryUserId).catch(() => null),
        ),
      );
      return active.map((link, index) => ({
        userId: link.primaryUserId,
        displayName: profiles[index]?.displayName ?? null,
      }));
    },
  });
}
