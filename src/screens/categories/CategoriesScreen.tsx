import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useCreateCategory,
  useDeleteCategory,
  useMyCategories,
  useUpdateCategory,
} from '../../features/categories/hooks/useCategories';
import { DEFAULT_CATEGORY_COLOR } from '../../features/categories/colors';
import { useTasksByOwner } from '../../features/tasks/hooks/useTaskApi';
import type { Category } from '../../shared/api/canplanTypes';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { MainStackParamList } from '../../navigation/types';
import BackButton from '../../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';
import CategoryFormModal, { type CategoryFormValues } from './CategoryFormModal';

type CategoriesNavigation = NativeStackNavigationProp<MainStackParamList, 'Categories'>;

export default function CategoriesScreen() {
  const navigation = useNavigation<CategoriesNavigation>();
  const route = useRoute<RouteProp<MainStackParamList, 'Categories'>>();
  const insets = useSafeAreaInsets();

  // Caregiver delegated management of a linked primary user's categories.
  const managedOwnerId = route.params?.ownerId;
  const managingName = route.params?.managingName;
  const managed = Boolean(managedOwnerId);

  const [ownerId, setOwnerId] = useState(managedOwnerId ?? '');
  const [identityError, setIdentityError] = useState<string>();

  const categoriesQuery = useMyCategories(true, 50, managedOwnerId);
  const tasksQuery = useTasksByOwner(ownerId);

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);

  useEffect(() => {
    // Managed mode: the owner is the primary user from the route.
    if (managedOwnerId) {
      setOwnerId(managedOwnerId);
      return;
    }
    let mounted = true;
    void getCurrentUserId()
      .then((userId) => mounted && setOwnerId(userId))
      .catch((error: unknown) =>
        mounted &&
        setIdentityError(
          error instanceof Error ? error.message : 'Could not load your categories.',
        ),
      );
    return () => {
      mounted = false;
    };
  }, [managedOwnerId]);

  // Pull every task page so the per-category counts are complete.
  useEffect(() => {
    if (tasksQuery.hasNextPage && !tasksQuery.isFetchingNextPage) {
      void tasksQuery.fetchNextPage();
    }
  }, [tasksQuery.hasNextPage, tasksQuery.isFetchingNextPage, tasksQuery]);

  const categories = useMemo(() => {
    const items = categoriesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return [...items].sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }, [categoriesQuery.data]);

  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const tasks = tasksQuery.data?.pages.flatMap((page) => page.items) ?? [];
    for (const task of tasks) {
      counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [tasksQuery.data]);

  const nextSortOrder = useMemo(() => {
    const orders = categories
      .map((c) => c.sortOrder)
      .filter((o): o is number => typeof o === 'number');
    return orders.length ? Math.max(...orders) + 1 : 0;
  }, [categories]);

  const saving = createMutation.isPending || updateMutation.isPending;

  const closeForm = () => {
    setFormMode(null);
    setEditing(null);
  };

  const reportError = (error: unknown) =>
    Alert.alert(
      'Something went wrong',
      error instanceof Error ? error.message : 'Please try again.',
    );

  const handleSubmit = (values: CategoryFormValues) => {
    if (formMode === 'create') {
      createMutation.mutate(
        {
          name: values.name,
          color: values.color,
          sortOrder: nextSortOrder,
          // Delegated: create under the managed primary user (undefined ⇒ self).
          userId: managedOwnerId,
        },
        { onSuccess: closeForm, onError: reportError },
      );
      return;
    }
    if (formMode === 'edit' && editing) {
      updateMutation.mutate(
        {
          categoryId: editing.categoryId,
          userId: managedOwnerId,
          color: values.color,
          // The default category's name can't be changed — only send it otherwise.
          ...(editing.isDefault ? {} : { name: values.name }),
        },
        { onSuccess: closeForm, onError: reportError },
      );
    }
  };

  const handleDelete = () => {
    if (!editing || editing.isDefault) return;
    Alert.alert(
      'Delete category?',
      `"${editing.name}" will be removed. Any tasks in it move to the default category.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(
              { categoryId: editing.categoryId, userId: managedOwnerId },
              { onSuccess: closeForm, onError: reportError },
            ),
        },
      ],
    );
  };

  const error =
    identityError ||
    (categoriesQuery.error ? categoriesQuery.error.message : undefined);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Categories
        </Text>
      </View>

      {managed ? (
        <View style={styles.banner}>
          <Ionicons name="people" size={16} color={colors.primary} />
          <Text style={styles.bannerText} numberOfLines={1}>
            Managing {managingName ?? 'this person'}
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View accessibilityRole="alert" style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!error && categoriesQuery.isLoading ? (
          <View accessibilityRole="progressbar" style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {!error && !categoriesQuery.isLoading && categories.length > 0 ? (
          <View style={styles.card}>
            {categories.map((category, index) => {
              const count = taskCounts.get(category.categoryId) ?? 0;
              return (
                <View key={category.categoryId}>
                  {index > 0 ? <View style={styles.rowDivider} /> : null}
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.colorBar,
                        { backgroundColor: category.color ?? DEFAULT_CATEGORY_COLOR },
                      ]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${category.name}`}
                      onPress={() =>
                        navigation.navigate('AllTasks', {
                          categoryId: category.categoryId,
                          categoryName: category.name,
                          ...(managed ? { ownerId: managedOwnerId, managingName } : {}),
                        })
                      }
                      style={styles.rowMain}
                    >
                      <View style={styles.rowText}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {category.name}
                        </Text>
                        <Text style={styles.rowCount}>
                          {count} {count === 1 ? 'task' : 'tasks'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={22} color={colors.disabled} />
                    </Pressable>
                    <View style={styles.editDivider} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${category.name}`}
                      onPress={() => {
                        setEditing(category);
                        setFormMode('edit');
                      }}
                      style={({ pressed }) => [
                        styles.editButton,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text style={styles.editText}>Edit</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {!error && !categoriesQuery.isLoading ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a category"
            onPress={() => {
              setEditing(null);
              setFormMode('create');
            }}
            style={({ pressed }) => [styles.addButton, pressed ? styles.addPressed : null]}
          >
            <Ionicons name="add" size={26} color={colors.primary} />
            <Text style={styles.addText}>Add Category</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <CategoryFormModal
        visible={formMode !== null}
        mode={formMode === 'edit' ? 'edit' : 'create'}
        initialName={editing?.name}
        initialColor={editing?.color}
        isDefault={editing?.isDefault ?? false}
        saving={saving}
        deleting={deleteMutation.isPending}
        onCancel={closeForm}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
  },
  bannerText: {
    ...typography.bodyStrong,
    color: colors.text,
    flexShrink: 1,
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
    gap: spacing.xl,
  },
  loadingState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
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
    ...typography.body,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 80,
  },
  colorBar: {
    width: 8,
    height: 44,
    borderRadius: radius.pill,
    marginLeft: spacing.lg,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    ...typography.heading,
    color: colors.text,
  },
  rowCount: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  editDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: spacing.lg,
    backgroundColor: colors.border,
  },
  editButton: {
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  editText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: '#FBEDE4',
  },
  addPressed: {
    opacity: 0.7,
  },
  addText: {
    ...typography.button,
    color: colors.primary,
  },
});
