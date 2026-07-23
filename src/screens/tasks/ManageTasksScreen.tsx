import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyCategories } from '../../features/categories/hooks/useCategories';
import { useInterfaceSettings } from '../../features/settings/interfaceSettings';
import {
  useDeleteTask,
  useTasksByOwner,
  useUpdateTask,
} from '../../features/tasks/hooks/useTaskApi';
import type { MainStackParamList } from '../../navigation/types';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { Task } from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import CategoryPickerSheet from '../../shared/components/CategoryPickerSheet';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type ManageTasksNavigation = NativeStackNavigationProp<MainStackParamList, 'ManageTasks'>;

// Wait for the confirm dialog to finish closing before the success toast shows,
// so the two don't overlap. Raise this number to make the toast appear later.
const MOVE_SUCCESS_TOAST_DELAY_MS = 400;
// How long the success toast stays on screen.
const TOAST_VISIBLE_MS = 1800;

function orderTasksByIds(tasks: Task[], orderedIds: string[]) {
  if (orderedIds.length === 0) return tasks;

  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  const used = new Set<string>();
  const ordered: Task[] = [];

  for (const id of orderedIds) {
    const task = byId.get(id);
    if (task) {
      ordered.push(task);
      used.add(id);
    }
  }

  for (const task of tasks) {
    if (!used.has(task.taskId)) ordered.push(task);
  }

  return ordered;
}

export default function ManageTasksScreen() {
  const navigation = useNavigation<ManageTasksNavigation>();
  const insets = useSafeAreaInsets();
  // Interface setting: with categories disabled the "Add to" action is hidden.
  const { useCategories } = useInterfaceSettings();
  const [ownerId, setOwnerId] = useState('');
  const [identityError, setIdentityError] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [categorySheetVisible, setCategorySheetVisible] = useState(false);
  // The category awaiting move confirmation, and a transient success toast.
  const [pendingCategory, setPendingCategory] = useState<{ categoryId: string; name: string }>();
  const [toastMessage, setToastMessage] = useState<string>();
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderedTasks, setOrderedTasks] = useState<Task[]>([]);
  const latestTaskOrderRef = useRef<string[]>([]);
  const tasksQuery = useTasksByOwner(ownerId);
  const categoriesQuery = useMyCategories(Boolean(ownerId), 50, ownerId);
  const deleteTaskMutation = useDeleteTask();
  const updateTaskMutation = useUpdateTask();

  useEffect(() => {
    let mounted = true;

    void getCurrentUserId()
      .then((userId) => {
        if (mounted) setOwnerId(userId);
      })
      .catch((err: unknown) => {
        if (mounted) {
          setIdentityError(
            err instanceof Error ? err.message : 'Could not load your tasks. Please try again.',
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const remoteTasks = useMemo(
    () => tasksQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [tasksQuery.data],
  );
  const error = identityError || tasksQuery.error?.message;

  // Seed local order from the server payload, then keep our reorder local while
  // merging in any additions/removals from the server.
  useEffect(() => {
    setOrderedTasks((prev) => {
      if (remoteTasks.length === 0) {
        latestTaskOrderRef.current = [];
        return prev.length === 0 ? prev : [];
      }

      const preferredOrder =
        latestTaskOrderRef.current.length > 0
          ? latestTaskOrderRef.current
          : prev.map((task) => task.taskId);
      const remoteById = new Map(remoteTasks.map((task) => [task.taskId, task]));
      const kept = preferredOrder
        .map((taskId) => remoteById.get(taskId))
        .filter((task): task is Task => Boolean(task));
      const seen = new Set(kept.map((t) => t.taskId));
      const additions = remoteTasks.filter((t) => !seen.has(t.taskId));
      const next = [...kept, ...additions];
      latestTaskOrderRef.current = next.map((task) => task.taskId);

      if (next.length === prev.length && next.every((task, index) => task === prev[index])) {
        return prev;
      }

      return next;
    });
  }, [remoteTasks]);

  const toggleSelected = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const selectedCount = selectedIds.size;
  const actionsDisabled =
    selectedCount === 0 || deleteTaskMutation.isPending || updateTaskMutation.isPending;
  const categories = useMemo(
    () => categoriesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [categoriesQuery.data],
  );

  const handleDelete = async () => {
    if (selectedCount === 0 || deleteTaskMutation.isPending) return;
    try {
      for (const taskId of selectedIds) {
        await deleteTaskMutation.mutateAsync(taskId);
      }
      setOrderedTasks((prev) => {
        const next = orderTasksByIds(prev, latestTaskOrderRef.current).filter(
          (t) => !selectedIds.has(t.taskId),
        );
        latestTaskOrderRef.current = next.map((task) => task.taskId);
        return next;
      });
      setSelectedIds(new Set());
      setConfirmDelete(false);
      navigation.navigate('AllTasks');
    } catch (err) {
      setIdentityError(
        err instanceof Error ? err.message : 'Could not delete the selected tasks.',
      );
      setConfirmDelete(false);
    }
  };

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(undefined);
      toastTimeoutRef.current = null;
    }, TOAST_VISIBLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (toastDelayTimeoutRef.current) clearTimeout(toastDelayTimeoutRef.current);
    },
    [],
  );

  // Picking a category no longer moves immediately — ask the user to confirm first.
  const requestMoveToCategory = useCallback(
    (categoryId: string) => {
      const name = categories.find((c) => c.categoryId === categoryId)?.name ?? 'this category';
      setCategorySheetVisible(false);
      setPendingCategory({ categoryId, name });
    },
    [categories],
  );

  const confirmMoveToCategory = async () => {
    if (!pendingCategory || selectedCount === 0 || updateTaskMutation.isPending) return;
    const { categoryId, name } = pendingCategory;
    const movedCount = selectedCount;
    try {
      for (const taskId of selectedIds) {
        await updateTaskMutation.mutateAsync({ taskId, categoryId });
      }
      setSelectedIds(new Set());
      setPendingCategory(undefined);
      // Let the confirm dialog finish dismissing before the toast appears.
      const message = `Added ${movedCount} ${movedCount === 1 ? 'task' : 'tasks'} to ${name}`;
      if (toastDelayTimeoutRef.current) clearTimeout(toastDelayTimeoutRef.current);
      toastDelayTimeoutRef.current = setTimeout(() => {
        showToast(message);
        toastDelayTimeoutRef.current = null;
      }, MOVE_SUCCESS_TOAST_DELAY_MS);
    } catch (err) {
      setIdentityError(
        err instanceof Error ? err.message : 'Could not move the selected tasks.',
      );
      setPendingCategory(undefined);
    }
  };

  const handleReorder = useCallback((data: Task[]) => {
    latestTaskOrderRef.current = data.map((task) => task.taskId);
    setOrderedTasks(data);
  }, []);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Task>) => {
      const selected = selectedIds.has(item.taskId);
      return (
        <ScaleDecorator>
          <View style={[styles.row, isActive ? styles.rowActive : null]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`Select ${item.title}`}
              onPress={() => toggleSelected(item.taskId)}
              hitSlop={8}
              style={[styles.checkbox, selected ? styles.checkboxChecked : null]}
            >
              {selected ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
            </Pressable>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {item.title}
            </Text>
            <Pressable
              accessibilityLabel={`Drag ${item.title} to reorder`}
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
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          All Tasks
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={({ pressed }) => [styles.doneButton, pressed ? styles.donePressed : null]}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      {error ? (
        <View accessibilityRole="alert" style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!error && (tasksQuery.isLoading || !ownerId) && orderedTasks.length === 0 ? (
        <View accessibilityRole="progressbar" style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading tasks…</Text>
        </View>
      ) : (
        <DraggableFlatList
          data={orderedTasks}
          keyExtractor={(task) => task.taskId}
          renderItem={renderItem}
          onDragEnd={({ data }) => handleReorder(data)}
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
        <BottomAction
          icon="trash-outline"
          label="Delete"
          disabled={actionsDisabled}
          onPress={() => setConfirmDelete(true)}
        />
        {useCategories ? (
          <BottomAction
            icon="folder-open-outline"
            label="Add to"
            disabled={actionsDisabled}
            onPress={() => setCategorySheetVisible(true)}
          />
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${selectedCount} ${selectedCount === 1 ? 'task' : 'tasks'}?`}
        message="These tasks and their steps cannot be restored."
        confirmLabel={deleteTaskMutation.isPending ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => {
          if (!deleteTaskMutation.isPending) setConfirmDelete(false);
        }}
      />

      <CategoryPickerSheet
        visible={categorySheetVisible}
        categories={categories}
        isLoading={categoriesQuery.isLoading}
        busy={updateTaskMutation.isPending}
        title={`Add ${selectedCount} ${selectedCount === 1 ? 'task' : 'tasks'} to…`}
        onCancel={() => {
          if (!updateTaskMutation.isPending) setCategorySheetVisible(false);
        }}
        onSelect={requestMoveToCategory}
      />

      <ConfirmDialog
        visible={Boolean(pendingCategory)}
        title={`Move ${selectedCount} ${selectedCount === 1 ? 'task' : 'tasks'}?`}
        message={
          pendingCategory
            ? `Add the selected ${selectedCount === 1 ? 'task' : 'tasks'} to “${pendingCategory.name}”.`
            : undefined
        }
        confirmLabel={updateTaskMutation.isPending ? 'Moving…' : 'Move'}
        cancelLabel="Cancel"
        onConfirm={() => {
          void confirmMoveToCategory();
        }}
        onCancel={() => {
          // Cancel returns to the category picker rather than the manage screen.
          if (!updateTaskMutation.isPending) {
            setPendingCategory(undefined);
            setCategorySheetVisible(true);
          }
        }}
      />

      {toastMessage ? (
        <View pointerEvents="none" style={styles.toastOverlay}>
          <View style={styles.toastCard}>
            <Ionicons name="checkmark-circle" size={30} color={colors.success} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface BottomActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}

function BottomAction({ icon, label, disabled, onPress }: BottomActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bottomAction,
        pressed && !disabled ? styles.bottomActionPressed : null,
      ]}
    >
      <Ionicons name={icon} size={26} color={disabled ? colors.disabled : colors.text} />
      <Text style={[styles.bottomActionLabel, disabled ? styles.bottomActionLabelDisabled : null]}>
        {label}
      </Text>
    </Pressable>
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
  doneButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  donePressed: {
    opacity: 0.6,
  },
  doneText: {
    ...typography.bodyStrong,
    color: colors.primary,
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
  // Transient "added" confirmation — a smaller, 80%-opacity version of the
  // confirm-dialog card, centred and non-interactive.
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 300,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    opacity: 0.8,
    ...shadow.cardStrong,
  },
  toastText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
});
