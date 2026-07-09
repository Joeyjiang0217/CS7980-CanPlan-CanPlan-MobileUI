import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyCategories } from '../../features/categories/hooks/useCategories';
import { useDeleteTask } from '../../features/tasks/hooks/useTaskApi';
import { useTask } from '../../features/tasks/hooks/useTask';
import type { MainStackParamList } from '../../navigation/types';
import BackButton from '../../shared/components/BackButton';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import TaskCard from '../../shared/components/TaskCard';
import { colors, radius, spacing, typography } from '../../shared/theme/tokens';

type TaskDetailNavigation = NativeStackNavigationProp<MainStackParamList, 'TaskDetail'>;
type TaskDetailRoute = RouteProp<MainStackParamList, 'TaskDetail'>;

export default function TaskDetailScreen() {
  const navigation = useNavigation<TaskDetailNavigation>();
  const route = useRoute<TaskDetailRoute>();
  const insets = useSafeAreaInsets();
  const { taskId } = route.params;

  const taskQuery = useTask(taskId);
  const categoriesQuery = useMyCategories(
    Boolean(taskQuery.data?.ownerId),
    50,
    taskQuery.data?.ownerId,
  );
  const deleteTaskMutation = useDeleteTask();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const category = useMemo(() => {
    const list = categoriesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return list.find((c) => c.categoryId === taskQuery.data?.categoryId);
  }, [categoriesQuery.data, taskQuery.data?.categoryId]);

  const handleDelete = async () => {
    if (deleteTaskMutation.isPending) return;
    try {
      const deleted = await deleteTaskMutation.mutateAsync(taskId);
      if (!deleted) {
        throw new Error('Task deletion returned no task. Please try again.');
      }
      setConfirmDelete(false);
      navigation.navigate('AllTasks');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not delete the task.');
      setConfirmDelete(false);
    }
  };

  const error = errorMessage ?? taskQuery.error?.message;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Task Details
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

        {taskQuery.isLoading || !taskQuery.data ? (
          <View accessibilityRole="progressbar" style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Loading task…</Text>
          </View>
        ) : (
          <TaskCard
            task={taskQuery.data}
            category={category}
            onOpen={() => navigation.navigate('TaskView', { taskId })}
            onEdit={() => navigation.navigate('CreateTask', { taskId })}
            onDelete={() => setConfirmDelete(true)}
            deleteDisabled={deleteTaskMutation.isPending}
            hideOpenButton
            categoryAboveTitle
            boxedDescription
          />
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete “${taskQuery.data?.title ?? ''}”?`}
        message="This task and its steps cannot be restored."
        confirmLabel={deleteTaskMutation.isPending ? 'Deleting…' : 'Delete Task'}
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => {
          if (!deleteTaskMutation.isPending) {
            setConfirmDelete(false);
          }
        }}
      />
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    flex: 1,
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
});
