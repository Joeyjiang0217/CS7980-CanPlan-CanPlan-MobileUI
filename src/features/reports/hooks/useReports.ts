import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  GenerateReportInput,
  SaveReportInput,
} from '../../../shared/api/canplanTypes';
import { queryKeys } from '../../../shared/query/queryKeys';
import {
  deleteReport,
  generateReport,
  getReportDownloadUrl,
  listReports,
  saveReport,
} from '../api/reportApi';

/** Paginated saved reports for a primary user, newest first. */
export function useReports(userId: string, limit = 50, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.reports.user(userId, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listReports(userId, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled: enabled && Boolean(userId),
  });
}

/** Short-lived download URL for a saved report JSON document. */
export function useReportDownloadUrl(
  userId: string,
  reportId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.reports.download(userId, reportId),
    queryFn: () => getReportDownloadUrl(userId, reportId),
    enabled: enabled && Boolean(userId) && Boolean(reportId),
  });
}

/** Generates a non-persisted report preview with a draft token. */
export function useGenerateReport() {
  return useMutation({
    mutationFn: (input: GenerateReportInput) => generateReport(input),
  });
}

/** Saves a generated report preview. */
export function useSaveReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveReportInput) => saveReport(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}

/** Deletes a saved report for a primary user. */
export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, reportId }: { userId: string; reportId: string }) =>
      deleteReport(userId, reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}
