import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyCategories } from '../../features/categories/hooks/useCategories';
import { useTasksByOwner } from '../../features/tasks/hooks/useTaskApi';
import type { MainStackParamList } from '../../navigation/types';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import BackButton from '../../shared/components/BackButton';
import TaskListItem from '../../shared/components/TaskListItem';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type SelectTaskNavigation = NativeStackNavigationProp<MainStackParamList, 'SelectTask'>;

export default function SelectTaskScreen() {
  const navigation = useNavigation<SelectTaskNavigation>();
  const insets = useSafeAreaInsets();

  const [ownerId, setOwnerId] = useState('');
  const [identityError, setIdentityError] = useState<string>();
  const tasksQuery = useTasksByOwner(ownerId);
  const categoriesQuery = useMyCategories(Boolean(ownerId), 50, ownerId);

  useEffect(() => {
    let mounted = true;
    void getCurrentUserId()
      .then((id) => {
        if (mounted) {
          setOwnerId(id);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setIdentityError(
            error instanceof Error ? error.message : 'Could not load your tasks. Please try again.',
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const tasks = useMemo(
    () => tasksQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [tasksQuery.data],
  );
  const categoryById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data?.pages.flatMap((page) => page.items) ?? []).map((category) => [
          category.categoryId,
          category,
        ]),
      ),
    [categoriesQuery.data],
  );
  const error = identityError || (tasksQuery.error ? tasksQuery.error.message : undefined);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Select task
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View accessibilityRole="alert" style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!error && (tasksQuery.isLoading || !ownerId) ? (
          <View accessibilityRole="progressbar" style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Loading tasks…</Text>
          </View>
        ) : null}

        {!error && ownerId && !tasksQuery.isLoading && tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkbox-outline" size={40} color={colors.primary} />
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={styles.emptyText}>Create a task first, then schedule it.</Text>
          </View>
        ) : null}

        <View style={styles.taskList}>
          {tasks.map((task) => (
            <TaskListItem
              key={task.taskId}
              task={task}
              category={task.categoryId ? categoryById.get(task.categoryId) : undefined}
              onPress={() =>
                navigation.navigate('ScheduleAssignment', {
                  taskId: task.taskId,
                  taskTitle: task.title,
                })
              }
            />
          ))}
        </View>

        {tasksQuery.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Load more tasks"
            accessibilityState={{ busy: tasksQuery.isFetchingNextPage }}
            disabled={tasksQuery.isFetchingNextPage}
            onPress={() => {
              void tasksQuery.fetchNextPage();
            }}
            style={({ pressed }) => [styles.loadMoreButton, pressed ? styles.pressed : null]}
          >
            {tasksQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.loadMoreText}>Load more</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    flex: 1,
    marginLeft: spacing.md,
    ...typography.title,
    color: colors.text,
  },
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FEE8E8',
  },
  errorText: {
    flex: 1,
    ...typography.caption,
    color: colors.danger,
  },
  loadingState: {
    minHeight: 180,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  emptyState: {
    minHeight: 220,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  taskList: {
    gap: spacing.lg,
  },
  loadMoreButton: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  loadMoreText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
