import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMediaDownloadUrl } from '../../features/media/hooks/useMedia';
import { useCoverThumbnailUri } from '../../features/media/hooks/useCoverThumbnails';
import type { Category, Task } from '../api/canplanTypes';
import CachedImage from './CachedImage';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';

interface TaskListItemProps {
  task: Task;
  category?: Category;
  onPress: () => void;
}

// The 72pt cover box in physical pixels (e.g. 216 on a 3x display), so the
// downscaled thumbnail is still pixel-sharp on screen.
const LIST_THUMB_SIZE = PixelRatio.getPixelSizeForLayoutSize(72);

export default function TaskListItem({ task, category, onPress }: TaskListItemProps) {
  const assetId = task.coverImageAssetId ?? '';
  const coverImageQuery = useMediaDownloadUrl(task.taskId, assetId);
  const downloadUrl = coverImageQuery.data?.downloadUrl ?? null;
  // Render the small disk-cached thumbnail instead of decoding the full-size
  // original — same 72×72 display box, far cheaper to decode and lay out.
  const coverUri = useCoverThumbnailUri(assetId || null, downloadUrl, LIST_THUMB_SIZE);
  const placeholderColor = category?.color?.trim() || colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      {coverUri ? (
        <CachedImage
          accessibilityLabel={`${task.title} cover photo`}
          uri={coverUri}
          cacheKey={`${assetId}:list-thumb-${LIST_THUMB_SIZE}`}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: placeholderColor }]}>
          {coverImageQuery.isLoading || Boolean(downloadUrl) ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Ionicons name="image-outline" size={24} color={colors.onPrimary} />
          )}
        </View>
      )}

      <Text numberOfLines={1} style={styles.title}>
        {task.title}
      </Text>

      <Ionicons name="chevron-forward" size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  cover: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    ...typography.heading,
    color: colors.text,
  },
  pressed: {
    opacity: 0.72,
  },
});
