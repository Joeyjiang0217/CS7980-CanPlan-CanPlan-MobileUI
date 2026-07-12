import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  CreateMediaAssetInput,
  CreateMediaUploadUrlInput,
  CreateTaskCoverImageUploadUrlInput,
  DeleteMediaAssetInput,
} from '../../../shared/api/canplanTypes';
import { queryKeys } from '../../../shared/query/queryKeys';
import {
  createMediaAsset,
  createMediaUploadUrl,
  createTaskCoverImageUploadUrl,
  deleteMediaAsset,
  getMediaDownloadUrl,
  listMediaForTask,
} from '../api/mediaApi';

/** Paginated metadata for all media assets belonging to a task. */
export function useMediaForTask(taskId: string, limit = 50) {
  return useInfiniteQuery({
    queryKey: queryKeys.media.task(taskId, limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMediaForTask(taskId, { limit, nextToken: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled: Boolean(taskId),
  });
}

/**
 * How long a fetched download URL is treated as fresh. Presigned URLs stay valid
 * for a while (see MediaDownloadTarget.expiresIn, typically ~1h); keeping the URL
 * fresh for 50 min lets re-mounts (re-opening the calendar, month grid, etc.)
 * reuse the cached URL and hit the on-disk image bytes immediately, instead of
 * re-requesting getMediaDownloadUrl on every screen open. Stays safely under the
 * URL's own TTL so we never hand out an expired URL for a not-yet-cached image.
 */
export const MEDIA_URL_STALE_TIME = 1000 * 60 * 50;

/** Fetches a short-lived private-S3 download URL for an existing media asset. */
export function useMediaDownloadUrl(taskId: string, assetId: string) {
  return useQuery({
    queryKey: queryKeys.media.download(taskId, assetId),
    queryFn: () => getMediaDownloadUrl(taskId, assetId),
    enabled: Boolean(taskId) && Boolean(assetId),
    staleTime: MEDIA_URL_STALE_TIME,
  });
}

/**
 * Resolves download URLs for a set of covers in ONE hook and returns
 * taskId → url. Screens that repeat the same covers across many cells (the
 * month grid renders up to 9 covers × ~30 days) should resolve here once at the
 * top and pass plain strings down, instead of mounting a useMediaDownloadUrl
 * hook per cell — hundreds of query subscribers per page is what made the month
 * pager janky. Shares the same query keys/staleTime as useMediaDownloadUrl, so
 * both read the same cache entries.
 */
export function useMediaDownloadUrlMap(
  refs: ReadonlyArray<{ taskId: string; assetId: string }>,
): ReadonlyMap<string, string | null> {
  return useQueries({
    queries: refs.map(({ taskId, assetId }) => ({
      queryKey: queryKeys.media.download(taskId, assetId),
      queryFn: () => getMediaDownloadUrl(taskId, assetId),
      enabled: Boolean(taskId) && Boolean(assetId),
      staleTime: MEDIA_URL_STALE_TIME,
    })),
    combine: (results) => {
      const map = new Map<string, string | null>();
      refs.forEach((ref, index) => {
        map.set(ref.taskId, results[index]?.data?.downloadUrl ?? null);
      });
      return map;
    },
  });
}

function useMediaMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation<TResult, Error, TInput>({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.media.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

/** First phase of regular media upload: PUT bytes to the returned URL, then register the asset. */
export function useCreateMediaUploadUrl() {
  return useMediaMutation((input: CreateMediaUploadUrlInput) => createMediaUploadUrl(input));
}

/** Registers the S3 object returned by createMediaUploadUrl after a successful PUT. */
export function useCreateMediaAsset() {
  return useMediaMutation((input: CreateMediaAssetInput) => createMediaAsset(input));
}

/** First phase of the task-cover flow; pass its s3Key to createTask or updateTask. */
export function useCreateTaskCoverImageUploadUrl() {
  return useMediaMutation((input: CreateTaskCoverImageUploadUrlInput) =>
    createTaskCoverImageUploadUrl(input),
  );
}

export function useDeleteMediaAsset() {
  return useMediaMutation((input: DeleteMediaAssetInput) => deleteMediaAsset(input));
}
