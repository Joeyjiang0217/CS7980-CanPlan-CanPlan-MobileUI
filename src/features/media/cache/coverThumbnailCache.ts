import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  documentDirectory,
  downloadAsync,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const THUMB_CACHE_VERSION = 'v2';
const THUMB_DIR = `${documentDirectory ?? cacheDirectory ?? ''}cover-thumbnails/`;
const THUMB_SIZE = 64;

function safeIdFor(assetId: string): string {
  return assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function thumbnailPathFor(assetId: string): string {
  return `${THUMB_DIR}${safeIdFor(assetId)}-${THUMB_SIZE}-${THUMB_CACHE_VERSION}.jpg`;
}

function sourcePathFor(assetId: string): string {
  return `${THUMB_DIR}${safeIdFor(assetId)}-source`;
}

let dirReady: Promise<void> | null = null;
function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = (async () => {
      const info = await getInfoAsync(THUMB_DIR);
      if (!info.exists) {
        await makeDirectoryAsync(THUMB_DIR, { intermediates: true });
      }
    })().catch((error) => {
      dirReady = null;
      throw error;
    });
  }
  return dirReady;
}

const inFlight = new Map<string, Promise<string>>();

export async function getCachedCoverThumbnailUri(assetId: string): Promise<string | null> {
  if (!THUMB_DIR) return null;
  const info = await getInfoAsync(thumbnailPathFor(assetId));
  return info.exists ? info.uri : null;
}

export async function ensureCoverThumbnailUri(
  assetId: string,
  sourceUri: string,
): Promise<string> {
  if (!THUMB_DIR) return sourceUri;

  const cached = await getCachedCoverThumbnailUri(assetId);
  if (cached) return cached;

  const existing = inFlight.get(assetId);
  if (existing) return existing;

  const task = (async () => {
    await ensureDir();
    const outputPath = thumbnailPathFor(assetId);
    const localSourceUri = sourceUri.startsWith('http')
      ? (await downloadAsync(sourceUri, sourcePathFor(assetId))).uri
      : sourceUri;
    const metadata = await manipulateAsync(localSourceUri, [], {
      compress: 1,
      format: SaveFormat.JPEG,
    });
    const cropSize = Math.min(metadata.width, metadata.height);
    const result = await manipulateAsync(
      localSourceUri,
      [
        {
          crop: {
            originX: Math.max(0, Math.floor((metadata.width - cropSize) / 2)),
            originY: Math.max(0, Math.floor((metadata.height - cropSize) / 2)),
            width: cropSize,
            height: cropSize,
          },
        },
        { resize: { width: THUMB_SIZE, height: THUMB_SIZE } },
      ],
      { compress: 0.72, format: SaveFormat.JPEG },
    );
    await copyAsync({ from: result.uri, to: outputPath });
    if (localSourceUri !== sourceUri) {
      void deleteAsync(localSourceUri, { idempotent: true });
    }
    return outputPath;
  })().finally(() => {
    inFlight.delete(assetId);
  });

  inFlight.set(assetId, task);
  return task;
}

export async function clearCoverThumbnailCache(): Promise<void> {
  if (!THUMB_DIR) return;
  try {
    await deleteAsync(THUMB_DIR, { idempotent: true });
  } finally {
    dirReady = null;
    inFlight.clear();
  }
}
