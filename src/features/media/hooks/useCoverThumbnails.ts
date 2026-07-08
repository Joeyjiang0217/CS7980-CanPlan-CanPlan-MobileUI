import { useEffect, useMemo, useState } from 'react';

import {
  ensureCoverThumbnailUri,
  getCachedCoverThumbnailUri,
} from '../cache/coverThumbnailCache';

type CoverRef = { taskId: string; assetId: string };

export function useCoverThumbnailUriMap(
  refs: ReadonlyArray<CoverRef>,
  sourceUriByTask: ReadonlyMap<string, string | null>,
): ReadonlyMap<string, string | null> {
  const [thumbnailUriByAsset, setThumbnailUriByAsset] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );

  const assetIds = useMemo(() => refs.map((ref) => ref.assetId).join('|'), [refs]);

  useEffect(() => {
    let active = true;

    void (async () => {
      for (const { taskId, assetId } of refs) {
        const cached = await getCachedCoverThumbnailUri(assetId);
        if (!active) return;
        if (cached) {
          setThumbnailUriByAsset((current) => {
            if (current.get(assetId) === cached) return current;
            const next = new Map(current);
            next.set(assetId, cached);
            return next;
          });
          continue;
        }

        const sourceUri = sourceUriByTask.get(taskId);
        if (!sourceUri) continue;

        try {
          const thumbnailUri = await ensureCoverThumbnailUri(assetId, sourceUri);
          if (!active) return;
          setThumbnailUriByAsset((current) => {
            if (current.get(assetId) === thumbnailUri) return current;
            const next = new Map(current);
            next.set(assetId, thumbnailUri);
            return next;
          });
        } catch {
          // Best-effort only. The month grid will simply skip the thumbnail
          // until a later render can generate it.
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [assetIds, refs, sourceUriByTask]);

  return useMemo(() => {
    const byTask = new Map<string, string | null>();
    for (const { taskId, assetId } of refs) {
      byTask.set(taskId, thumbnailUriByAsset.get(assetId) ?? null);
    }
    return byTask;
  }, [refs, thumbnailUriByAsset]);
}
