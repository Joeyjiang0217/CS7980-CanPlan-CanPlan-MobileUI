import { Image, type ImageProps } from 'expo-image';

export interface CachedImageProps extends Omit<ImageProps, 'source'> {
  /** Remote URL to download from when not yet cached (S3 URLs may rotate). */
  uri: string | null;
  /** Stable cache key — use the asset's id / s3Key, NOT the rotating URL. */
  cacheKey: string;
}

/**
 * expo-image wrapper that caches bytes by a STABLE `cacheKey` instead of the URL.
 *
 * S3 presigned URLs change on every fetch, so a URL-keyed cache misses on every
 * screen change / reload and re-downloads (the "flash"). Keying by a stable id
 * means the same image is served from disk across URL changes and app reloads.
 */
export default function CachedImage({
  uri,
  cacheKey,
  cachePolicy = 'memory-disk',
  transition = 150,
  ...rest
}: CachedImageProps) {
  return (
    <Image
      source={uri ? { uri, cacheKey } : null}
      // Stable identity so recycled tiles (e.g. the month grid) don't flash a
      // previous cover before the correct one resolves.
      recyclingKey={cacheKey}
      // Fade the bytes in instead of popping — smoother when a URL/byte fetch
      // completes a moment after mount.
      transition={transition}
      cachePolicy={cachePolicy}
      {...rest}
    />
  );
}
