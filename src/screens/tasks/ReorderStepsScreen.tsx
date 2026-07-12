import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useDeleteTaskStep,
  useReorderTaskSteps,
  useTaskSteps,
} from '../../features/tasks/hooks/useTaskApi';
import type { MainStackParamList } from '../../navigation/types';
import type { Connection, TaskStep } from '../../shared/api/canplanTypes';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import { queryKeys } from '../../shared/query/queryKeys';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type ReorderStepsNavigation = NativeStackNavigationProp<MainStackParamList, 'ReorderSteps'>;
type ReorderStepsRoute = RouteProp<MainStackParamList, 'ReorderSteps'>;

const TASK_STEPS_QUERY_LIMIT = 50;

function reorderCachedStepPages(
  cached: InfiniteData<Connection<TaskStep>> | undefined,
  orderedSteps: TaskStep[],
) {
  const reorderedSteps = orderedSteps.map((step, index) => ({
    ...step,
    order: index + 1,
  }));

  if (!cached) {
    return {
      pages: [{ items: reorderedSteps, nextToken: null }],
      pageParams: [undefined],
    };
  }

  let cursor = 0;
  return {
    ...cached,
    pages: cached.pages.map((page) => {
      const pageSize = page.items.length;
      const items = reorderedSteps.slice(cursor, cursor + pageSize);
      cursor += pageSize;
      return { ...page, items };
    }),
  };
}

export default function ReorderStepsScreen() {
  const navigation = useNavigation<ReorderStepsNavigation>();
  const route = useRoute<ReorderStepsRoute>();
  const insets = useSafeAreaInsets();
  const { taskId } = route.params;
  const queryClient = useQueryClient();

  const stepsQuery = useTaskSteps(taskId, TASK_STEPS_QUERY_LIMIT);
  const deleteStepMutation = useDeleteTaskStep();
  const reorderStepsMutation = useReorderTaskSteps();

  const [orderedSteps, setOrderedSteps] = useState<TaskStep[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const remoteSteps = useMemo(
    () =>
      [...(stepsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort(
        (a, b) => a.order - b.order,
      ),
    [stepsQuery.data],
  );

  // Seed local order once the remote payload arrives, preserving any local
  // reordering for ids that still exist (e.g. after a background refetch).
  useEffect(() => {
    setOrderedSteps((prev) => {
      if (remoteSteps.length === 0) {
        return prev.length === 0 ? prev : [];
      }
      const remoteById = new Map(remoteSteps.map((step) => [step.stepId, step]));
      const kept = prev
        .map((step) => remoteById.get(step.stepId))
        .filter((step): step is TaskStep => Boolean(step));
      const seen = new Set(kept.map((s) => s.stepId));
      const additions = remoteSteps.filter((s) => !seen.has(s.stepId));
      const next = [...kept, ...additions];
      if (next.length === prev.length && next.every((s, i) => s.stepId === prev[i].stepId)) {
        return prev;
      }
      return next;
    });
  }, [remoteSteps]);

  const toggleSelected = useCallback((stepId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  const selectedCount = selectedIds.size;
  const deleteDisabled = selectedCount === 0 || deleteStepMutation.isPending;

  const handleDone = async () => {
    const hasOrderChanged =
      orderedSteps.length === remoteSteps.length &&
      orderedSteps.some((step, idx) => step.stepId !== remoteSteps[idx]?.stepId);

    if (!hasOrderChanged || reorderStepsMutation.isPending) {
      navigation.goBack();
      return;
    }
    try {
      await reorderStepsMutation.mutateAsync({
        taskId,
        steps: orderedSteps.map((step, idx) => ({ stepId: step.stepId, order: idx + 1 })),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.tasks.steps(taskId, TASK_STEPS_QUERY_LIMIT),
      });
      queryClient.setQueryData<InfiniteData<Connection<TaskStep>>>(
        queryKeys.tasks.steps(taskId, TASK_STEPS_QUERY_LIMIT),
        (cached) => reorderCachedStepPages(cached, orderedSteps),
      );
      navigation.goBack();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save the new order.');
    }
  };

  const handleDelete = async () => {
    if (deleteDisabled) return;
    try {
      for (const stepId of selectedIds) {
        await deleteStepMutation.mutateAsync({ taskId, stepId });
      }
      setOrderedSteps((prev) => prev.filter((s) => !selectedIds.has(s.stepId)));
      setSelectedIds(new Set());
      setConfirmDelete(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not delete the selected steps.',
      );
      setConfirmDelete(false);
    }
  };

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<TaskStep>) => {
      const index = getIndex() ?? 0;
      const selected = selectedIds.has(item.stepId);
      return (
        <ScaleDecorator>
          <View style={[styles.row, isActive ? styles.rowActive : null]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`Select step ${index + 1}`}
              onPress={() => toggleSelected(item.stepId)}
              hitSlop={8}
              style={[styles.checkbox, selected ? styles.checkboxChecked : null]}
            >
              {selected ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
            </Pressable>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {item.text || `Step ${index + 1}`}
            </Text>
            <Pressable
              accessibilityLabel={`Drag step ${index + 1} to reorder`}
              onPressIn={drag}
              disabled={isActive}
              hitSlop={8}
              style={styles.dragHandle}
            >
              <Ionicons name="reorder-three" size={28} color={colors.textMuted} />
            </Pressable>
          </View>
        </ScaleDecorator>
      );
    },
    [selectedIds, toggleSelected],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerAction, pressed ? styles.pressed : null]}
        >
          <Text style={styles.headerActionText}>Cancel</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Reorder Steps
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityState={{ disabled: reorderStepsMutation.isPending }}
          disabled={reorderStepsMutation.isPending}
          onPress={() => {
            void handleDone();
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.headerAction, pressed ? styles.pressed : null]}
        >
          <Text style={[styles.headerActionText, styles.headerActionPrimary]}>
            {reorderStepsMutation.isPending ? 'Saving…' : 'Done'}
          </Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <View accessibilityRole="alert" style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {stepsQuery.isLoading && orderedSteps.length === 0 ? (
        <View accessibilityRole="progressbar" style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading steps…</Text>
        </View>
      ) : (
        <DraggableFlatList
          data={orderedSteps}
          keyExtractor={(step) => step.stepId}
          renderItem={renderItem}
          onDragEnd={({ data }) => setOrderedSteps(data)}
          activationDistance={12}
          autoscrollThreshold={90}
          autoscrollSpeed={180}
          showsVerticalScrollIndicator={false}
          containerStyle={styles.list}
          contentContainerStyle={
            [styles.listContent, { paddingBottom: spacing.xl }] as StyleProp<ViewStyle>
          }
        />
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete selected"
          accessibilityState={{ disabled: deleteDisabled }}
          disabled={deleteDisabled}
          onPress={() => setConfirmDelete(true)}
          style={({ pressed }) => [
            styles.bottomAction,
            pressed && !deleteDisabled ? styles.bottomActionPressed : null,
          ]}
        >
          <Ionicons
            name="trash-outline"
            size={26}
            color={deleteDisabled ? colors.disabled : colors.text}
          />
          <Text
            style={[
              styles.bottomActionLabel,
              deleteDisabled ? styles.bottomActionLabelDisabled : null,
            ]}
          >
            Delete
          </Text>
        </Pressable>
      </View>

      {confirmDelete ? (
        <ConfirmDialog
          visible
          title={`Delete ${selectedCount} ${selectedCount === 1 ? 'step' : 'steps'}?`}
          message="These steps cannot be restored."
          confirmLabel={deleteStepMutation.isPending ? 'Deleting…' : 'Delete Steps'}
          cancelLabel="Cancel"
          destructive
          onConfirm={() => {
            void handleDelete();
          }}
          onCancel={() => {
            if (!deleteStepMutation.isPending) setConfirmDelete(false);
          }}
        />
      ) : null}
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
  headerAction: {
    minWidth: 60,
    paddingVertical: spacing.xs,
  },
  headerActionText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  headerActionPrimary: {
    color: colors.primary,
    textAlign: 'right',
  },
  headerTitle: {
    flex: 1,
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
  },
  errorBanner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
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
    flex: 1,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  rowActive: {
    borderColor: colors.primary,
    ...shadow.cardStrong,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  rowTitle: {
    flex: 1,
    ...typography.heading,
    color: colors.text,
  },
  dragHandle: {
    paddingHorizontal: spacing.xs,
  },
  bottomBar: {
    flexDirection: 'row',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  bottomAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  bottomActionPressed: {
    opacity: 0.6,
  },
  bottomActionLabel: {
    ...typography.caption,
    color: colors.text,
  },
  bottomActionLabelDisabled: {
    color: colors.disabled,
  },
  pressed: {
    opacity: 0.6,
  },
});
