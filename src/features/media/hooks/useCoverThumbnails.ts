import { useEffect, useMemo, useState } from 'react';

import {
  ensureCoverPreviewUri,
  ensureCoverThumbnailUri,
  getCachedCoverPreviewUri,
  getCachedCoverThumbnailUri,
} from '../cache/coverThumbnailCache';

type CoverRef = { taskId: string; assetId: string };

/**
 * Single-asset variant: resolves a square disk-cached cover thumbnail of the
 * given pixel size, generating it from `sourceUri` on first use. Returns null
 * until ready, so list rows never decode the full-size original.
 */
export function useCoverThumbnailUri(
  assetId: string | null | undefined,
  sourceUri: string | null | undefined,
  size?: number,
): string | null {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUri(null);
    if (!assetId) {
      return;
    }
    void (async () => {
      const cached = await getCachedCoverThumbnailUri(assetId, size);
      if (!active) {
        return;
      }
      if (cached) {
        setUri(cached);
        return;
      }
      if (!sourceUri) {
        return;
      }
      try {
        const generated = await ensureCoverThumbnailUri(assetId, sourceUri, size);
        if (active) {
          setUri(generated);
        }
      } catch {
        // Best-effort: the row keeps its placeholder until a later render.
      }
    })();
    return () => {
      active = false;
    };
  }, [assetId, sourceUri, size]);

  return uri;
}

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

export function useCoverPreviewUriMap(
  refs: ReadonlyArray<CoverRef>,
  sourceUriByTask: ReadonlyMap<string, string | null>,
): ReadonlyMap<string, string | null> {
  const [previewUriByAsset, setPreviewUriByAsset] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );

  const assetIds = useMemo(() => refs.map((ref) => ref.assetId).join('|'), [refs]);

  useEffect(() => {
    let active = true;

    void (async () => {
      for (const { taskId, assetId } of refs) {
        const cached = await getCachedCoverPreviewUri(assetId);
        if (!active) return;
        if (cached) {
          setPreviewUriByAsset((current) => {
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
          const previewUri = await ensureCoverPreviewUri(assetId, sourceUri);
          if (!active) return;
          setPreviewUriByAsset((current) => {
            if (current.get(assetId) === previewUri) return current;
            const next = new Map(current);
            next.set(assetId, previewUri);
            return next;
          });
        } catch {
          // Best-effort only. Cards keep using the small thumbnail until the
          // clearer local preview can be generated.
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
      byTask.set(taskId, previewUriByAsset.get(assetId) ?? null);
    }
    return byTask;
  }, [refs, previewUriByAsset]);
}
