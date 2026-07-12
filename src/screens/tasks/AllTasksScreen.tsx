import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyCategories } from '../../features/categories/hooks/useCategories';
import { useSimpleMode } from '../../features/users/hooks/useSimpleMode';
import {
  useDeleteTask,
  useTasksByCategory,
  useTasksByOwner,
} from '../../features/tasks/hooks/useTaskApi';
import type { MainStackParamList } from '../../navigation/types';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { Task } from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import TaskListItem from '../../shared/components/TaskListItem';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type AllTasksNavigation = NativeStackNavigationProp<MainStackParamList, 'AllTasks'>;
type AllTasksRoute = RouteProp<MainStackParamList, 'AllTasks'>;

const SETTINGS_MULTI_TAP_TIMEOUT_MS = 1500;

export default function AllTasksScreen() {
  const navigation = useNavigation<AllTasksNavigation>();
  const route = useRoute<AllTasksRoute>();
  const insets = useSafeAreaInsets();
  const simpleMode = useSimpleMode();

  // When a categoryId is supplied this screen is a single-category view:
  // filtered tasks, back-to-Categories, and no manage/add nav buttons.
  const categoryId = route.params?.categoryId;
  const categoryName = route.params?.categoryName;
  const categoryMode = Boolean(categoryId);

  const [ownerId, setOwnerId] = useState('');
  const [identityError, setIdentityError] = useState<string>();
  // "+" popover menu (Add a task / Edit) and the inline edit mode it opens:
  // cards shift right behind a red delete badge, and tapping a card jumps
  // straight to the task editor.
  const [menuVisible, setMenuVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const deleteTaskMutation = useDeleteTask();
  const [settingsTapCount, setSettingsTapCount] = useState(0);
  const settingsTapResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only one of these queries is enabled at a time (the other gets an empty id).
  const ownerTasksQuery = useTasksByOwner(categoryMode ? '' : ownerId);
  const categoryTasksQuery = useTasksByCategory(ownerId, categoryId ?? '');
  const tasksQuery = categoryMode ? categoryTasksQuery : ownerTasksQuery;
  const categoriesQuery = useMyCategories(Boolean(ownerId), 50, ownerId);

  useEffect(() => {
    let mounted = true;

    void getCurrentUserId()
      .then((userId) => {
        if (mounted) {
          setOwnerId(userId);
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
  // The selected category's colour drives the header accent bar + tinted band.
  const categoryColor = categoryId
    ? categoryById.get(categoryId)?.color ?? undefined
    : undefined;

  const clearSettingsTapTimeout = useCallback(() => {
    if (settingsTapResetTimeoutRef.current) {
      clearTimeout(settingsTapResetTimeoutRef.current);
      settingsTapResetTimeoutRef.current = null;
    }
  }, []);

  const resetSettingsTapState = useCallback(() => {
    clearSettingsTapTimeout();
    setSettingsTapCount(0);
  }, [clearSettingsTapTimeout]);

  useEffect(() => resetSettingsTapState, [resetSettingsTapState]);

  const handleSettingsPress = useCallback(() => {
    const nextTapCount = settingsTapCount + 1;

    if (nextTapCount >= 3) {
      resetSettingsTapState();
      navigation.navigate('Settings');
      return;
    }

    setSettingsTapCount(nextTapCount);
    clearSettingsTapTimeout();
    settingsTapResetTimeoutRef.current = setTimeout(() => {
      setSettingsTapCount(0);
      settingsTapResetTimeoutRef.current = null;
    }, SETTINGS_MULTI_TAP_TIMEOUT_MS);
  }, [clearSettingsTapTimeout, navigation, resetSettingsTapState, settingsTapCount]);

  const simpleModeHeaderMessage = useMemo(() => {
    if (settingsTapCount === 1) return 'Tap 2 times for settings';
    if (settingsTapCount === 2) return 'Tap 1 time for settings';
    return 'All Tasks';
  }, [settingsTapCount]);

  // Drives the edit-mode transition: the delete-badge column animates its
  // width 0 → full, which slides the cards right (and back on exit, after
  // which the badges unmount).
  const editAnim = useRef(new Animated.Value(0)).current;
  const toggleEditMode = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        setEditMode(true);
      }
      Animated.timing(editAnim, {
        toValue: enabled ? 1 : 0,
        duration: 220,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!enabled && finished) {
          setEditMode(false);
        }
      });
    },
    [editAnim],
  );

  const confirmDeleteTask = useCallback(async () => {
    if (!taskToDelete || deleteTaskMutation.isPending) {
      return;
    }
    try {
      await deleteTaskMutation.mutateAsync(taskToDelete.taskId);
      setTaskToDelete(null);
    } catch (err) {
      setTaskToDelete(null);
      Alert.alert(
        'Could not delete this task',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  }, [taskToDelete, deleteTaskMutation]);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm },
          // Tint the header band with the category colour (low-alpha 8-digit hex).
          categoryMode && categoryColor ? { backgroundColor: `${categoryColor}22` } : null,
        ]}
      >
        {/* Category view and normal mode show Back; Simple Mode root has none. */}
        <View style={styles.headerSide}>
          {categoryMode || !simpleMode ? (
            <BackButton onPress={() => navigation.goBack()} variant="dark" />
          ) : (
            <View style={styles.headerPlaceholder} />
          )}
        </View>
        <View style={styles.headerCenter}>
          {categoryMode ? (
            <View
              style={[styles.categoryHeaderTitleWrap]}
            >
              <View
                style={[styles.categoryBar, { backgroundColor: categoryColor ?? colors.primary }]}
              />
              <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>
                {categoryName ?? 'Tasks'}
              </Text>
            </View>
          ) : simpleMode && settingsTapCount > 0 ? (
            <View style={styles.headerPrompt}>
              <Text accessibilityRole="header" style={styles.headerPromptText} numberOfLines={1}>
                {simpleModeHeaderMessage}
              </Text>
            </View>
          ) : (
            <Text accessibilityRole="header" style={styles.headerTitleCentered} numberOfLines={1}>
              All Tasks
            </Text>
          )}
        </View>
        <View
          style={[
            styles.headerSide,
            styles.headerSideRight,
            !categoryMode && !simpleMode ? styles.headerSideWide : null,
          ]}
        >
          {categoryMode ? null : simpleMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={handleSettingsPress}
              style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
            >
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </Pressable>
          ) : editMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Finish editing"
              onPress={() => toggleEditMode(false)}
              style={({ pressed }) => [styles.headerDoneButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.headerDoneText}>Done</Text>
            </Pressable>
          ) : (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage tasks"
                onPress={() => navigation.navigate('ManageTasks')}
                style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="list-outline" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open task actions"
                onPress={() => setMenuVisible(true)}
                style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="add" size={24} color={colors.text} />
              </Pressable>
            </View>
          )}
        </View>
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
            <Text style={styles.emptyText}>Create a task to see it here.</Text>
          </View>
        ) : null}

        <View style={styles.taskList}>
          {tasks.map((task) => (
            <View key={task.taskId} style={styles.taskRow}>
              {editMode ? (
                <Animated.View
                  style={[
                    styles.deleteBadgeWrap,
                    {
                      width: editAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 28 + spacing.md],
                      }),
                      opacity: editAnim,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${task.title}`}
                    onPress={() => setTaskToDelete(task)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.deleteBadge, pressed ? styles.pressed : null]}
                  >
                    <Ionicons name="remove" size={20} color={colors.onPrimary} />
                  </Pressable>
                </Animated.View>
              ) : null}
              <View style={styles.taskRowItem}>
                <TaskListItem
                  task={task}
                  category={task.categoryId ? categoryById.get(task.categoryId) : undefined}
                  onPress={() =>
                    editMode
                      ? navigation.navigate('CreateTask', { taskId: task.taskId })
                      : navigation.navigate('TaskView', { taskId: task.taskId })
                  }
                />
              </View>
            </View>
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

        {categoryMode || !simpleMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a task"
            onPress={() =>
              navigation.navigate(
                'CreateTask',
                categoryMode
                  ? { fixedCategoryId: categoryId, fixedCategoryName: categoryName }
                  : undefined,
              )
            }
            style={({ pressed }) => [styles.addTaskButton, pressed ? styles.addTaskButtonPressed : null]}
          >
            <Ionicons name="add" size={32} color={colors.primary} />
            <Text style={styles.addTaskText}>Add a task</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* "+" popover: anchored under the header button, WeChat-style. */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          {/* Outer layer carries the shadow; the inner card clips its children
              (pressed-row backgrounds) to the rounded corners. */}
          <View style={[styles.menuCardShadow, { top: insets.top + spacing.sm + 44 + spacing.xs }]}>
            <View style={styles.menuCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a task"
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('CreateTask');
              }}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <Ionicons name="add-circle-outline" size={22} color={colors.text} />
              <Text style={styles.menuItemText}>Add a task</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit tasks"
              onPress={() => {
                setMenuVisible(false);
                toggleEditMode(true);
              }}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <Ionicons name="create-outline" size={22} color={colors.text} />
              <Text style={styles.menuItemText}>Edit</Text>
            </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={taskToDelete !== null}
        title="Delete 1 task?"
        message="These tasks and their steps cannot be restored."
        confirmLabel={deleteTaskMutation.isPending ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        onConfirm={() => void confirmDeleteTask()}
        onCancel={() => {
          if (!deleteTaskMutation.isPending) {
            setTaskToDelete(null);
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
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerSide: {
    width: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  headerSideWide: {
    width: 96,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerPlaceholder: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    ...typography.title,
    color: colors.text,
  },
  headerTitleCentered: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
  },
  categoryHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryBar: {
    width: 8,
    height: 32,
    borderRadius: radius.pill,
  },
  headerPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  headerPromptText: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  headerDoneButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  headerDoneText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  // "+" popover menu, anchored under the header's right-side buttons.
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 14, 6, 0.15)',
  },
  menuCardShadow: {
    position: 'absolute',
    right: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  menuCard: {
    minWidth: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  menuItemText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
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
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskRowItem: {
    flex: 1,
  },
  // Animated column hosting the delete badge; its width growing from 0 is
  // what slides the card to the right.
  deleteBadgeWrap: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  // iOS-style red delete badge shown to the left of each card in edit mode.
  deleteBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
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
  addTaskButton: {
    minHeight: 142,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: 'rgba(224, 119, 68, 0.7)',
    borderRadius: radius.lg + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(224, 119, 68, 0.035)',
  },
  addTaskButtonPressed: {
    backgroundColor: 'rgba(224, 119, 68, 0.1)',
  },
  addTaskText: {
    ...typography.title,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
