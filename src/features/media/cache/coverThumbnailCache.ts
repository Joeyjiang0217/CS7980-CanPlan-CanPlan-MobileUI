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
const PREVIEW_CACHE_VERSION = 'v2';
const THUMB_DIR = `${documentDirectory ?? cacheDirectory ?? ''}cover-thumbnails/`;
const THUMB_SIZE = 64;
const PREVIEW_WIDTH = 768;

function safeIdFor(assetId: string): string {
  return assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function thumbnailPathFor(assetId: string, size: number): string {
  return `${THUMB_DIR}${safeIdFor(assetId)}-${size}-${THUMB_CACHE_VERSION}.jpg`;
}

function previewPathFor(assetId: string): string {
  return `${THUMB_DIR}${safeIdFor(assetId)}-preview-${PREVIEW_WIDTH}-${PREVIEW_CACHE_VERSION}.jpg`;
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

export async function getCachedCoverThumbnailUri(
  assetId: string,
  size: number = THUMB_SIZE,
): Promise<string | null> {
  if (!THUMB_DIR) return null;
  const info = await getInfoAsync(thumbnailPathFor(assetId, size));
  return info.exists ? info.uri : null;
}

export async function getCachedCoverPreviewUri(assetId: string): Promise<string | null> {
  if (!THUMB_DIR) return null;
  const info = await getInfoAsync(previewPathFor(assetId));
  return info.exists ? info.uri : null;
}

export async function ensureCoverThumbnailUri(
  assetId: string,
  sourceUri: string,
  size: number = THUMB_SIZE,
): Promise<string> {
  if (!THUMB_DIR) return sourceUri;

  const cached = await getCachedCoverThumbnailUri(assetId, size);
  if (cached) return cached;

  const inFlightKey = `${assetId}:${size}`;
  const existing = inFlight.get(inFlightKey);
  if (existing) return existing;

  const task = (async () => {
    await ensureDir();
    const outputPath = thumbnailPathFor(assetId, size);
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
        { resize: { width: size, height: size } },
      ],
      { compress: 0.72, format: SaveFormat.JPEG },
    );
    await copyAsync({ from: result.uri, to: outputPath });
    if (localSourceUri !== sourceUri) {
      void deleteAsync(localSourceUri, { idempotent: true });
    }
    return outputPath;
  })().finally(() => {
    inFlight.delete(inFlightKey);
  });

  inFlight.set(inFlightKey, task);
  return task;
}

export async function ensureCoverPreviewUri(
  assetId: string,
  sourceUri: string,
): Promise<string> {
  if (!THUMB_DIR) return sourceUri;

  const cached = await getCachedCoverPreviewUri(assetId);
  if (cached) return cached;

  const inFlightKey = `${assetId}:preview`;
  const existing = inFlight.get(inFlightKey);
  if (existing) return existing;

  const task = (async () => {
    await ensureDir();
    const outputPath = previewPathFor(assetId);
    const localSourceUri = sourceUri.startsWith('http')
      ? (await downloadAsync(sourceUri, sourcePathFor(`${assetId}-preview`))).uri
      : sourceUri;
    const result = await manipulateAsync(
      localSourceUri,
      [{ resize: { width: PREVIEW_WIDTH } }],
      { compress: 0.78, format: SaveFormat.JPEG },
    );
    await copyAsync({ from: result.uri, to: outputPath });
    if (localSourceUri !== sourceUri) {
      void deleteAsync(localSourceUri, { idempotent: true });
    }
    return outputPath;
  })().finally(() => {
    inFlight.delete(inFlightKey);
  });

  inFlight.set(inFlightKey, task);
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
