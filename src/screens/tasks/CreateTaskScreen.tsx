import { Ionicons } from '@expo/vector-icons';
import {
  UNSTABLE_usePreventRemove,
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCreateAiTask } from '../../features/ai/hooks/useCreateAiTask';
import {
  useCreateTask,
  useCreateTaskStep,
  useDeleteTask,
  useDeleteTaskStep,
  useTaskSteps,
  useUpdateTask,
} from '../../features/tasks/hooks/useTaskApi';
import {
  useCreateTaskCoverImageUploadUrl,
  useDeleteMediaAsset,
  useMediaDownloadUrl,
} from '../../features/media/hooks/useMedia';
import { useTask } from '../../features/tasks/hooks/useTask';
import { useMyCategories } from '../../features/categories/hooks/useCategories';
import { useInterfaceSettings } from '../../features/settings/interfaceSettings';
import type { MainStackParamList } from '../../navigation/types';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import type { Category, MediaAsset, MediaType } from '../../shared/api/canplanTypes';
import BackButton from '../../shared/components/BackButton';
import CachedImage from '../../shared/components/CachedImage';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type CreateTaskNavigation = NativeStackNavigationProp<MainStackParamList, 'CreateTask'>;
type CreateTaskRoute = RouteProp<MainStackParamList, 'CreateTask'>;
type SelectedImage = ImagePicker.ImagePickerAsset;

interface DraftStep {
  stepId: string;
  order: number;
  text: string;
  mediaAssets: MediaAsset[];
}

interface CategorySheetProps {
  visible: boolean;
  categories: Category[];
  isLoading: boolean;
  selectedCategoryId?: string;
  busy: boolean;
  onCancel: () => void;
  onSelect: (categoryId: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

type MediaDisplay = { icon: keyof typeof Ionicons.glyphMap; label: string };

function mediaDisplay(type?: MediaType): MediaDisplay {
  switch (type) {
    case 'VIDEO':
      return { icon: 'videocam-outline', label: 'Video' };
    case 'AUDIO':
      return { icon: 'mic-outline', label: 'Audio' };
    default:
      return { icon: 'image-outline', label: 'Photo' };
  }
}

// One indicator per kind of media a step carries: the single visual (photo OR
// video) and, independently, an audio note — so a photo+audio step shows two.
function stepMediaIndicators(mediaAssets: MediaAsset[]): MediaDisplay[] {
  const indicators: MediaDisplay[] = [];
  const visual = mediaAssets.find((asset) => asset.type === 'IMAGE' || asset.type === 'VIDEO');
  if (visual) {
    indicators.push(mediaDisplay(visual.type));
  }
  if (mediaAssets.some((asset) => asset.type === 'AUDIO')) {
    indicators.push(mediaDisplay('AUDIO'));
  }
  return indicators;
}

function contentTypeForImage(image: SelectedImage): string {
  if (image.mimeType?.startsWith('image/')) {
    return image.mimeType;
  }

  const extension = image.uri.split('?')[0].split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

function fileNameForImage(image: SelectedImage, contentType: string): string {
  if (image.fileName?.trim()) {
    return image.fileName;
  }

  const suffix = contentType.split('/')[1] || 'jpg';
  return `image.${suffix}`;
}

async function uploadImageToPresignedUrl(
  image: SelectedImage,
  uploadUrl: string,
  contentType: string,
): Promise<number> {
  const body = image.file ?? (await fetch(image.uri)).blob();
  const bytes = await body;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed (${uploadResponse.status}). Please try again.`);
  }

  return image.fileSize ?? bytes.size;
}

function CategorySheet({
  visible,
  categories,
  isLoading,
  selectedCategoryId,
  busy,
  onCancel,
  onSelect,
}: CategorySheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={busy ? undefined : onCancel}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close category selector"
          disabled={busy}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel category selection"
              disabled={busy}
              onPress={onCancel}
              style={({ pressed }) => [styles.sheetTextButton, pressed && !busy ? styles.pressed : null]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>Choose Category</Text>
            <View style={styles.sheetTextButton} />
          </View>

          <ScrollView contentContainerStyle={styles.choiceSheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.choiceList}>
              {categories.map((category, index) => (
                <View key={category.categoryId}>
                  {index > 0 ? <View style={styles.choiceDivider} /> : null}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={category.name}
                    accessibilityState={{ selected: selectedCategoryId === category.categoryId }}
                    disabled={busy}
                    onPress={() => onSelect(category.categoryId)}
                    style={({ pressed }) => [styles.choiceRow, pressed && !busy ? styles.choiceRowPressed : null]}
                  >
                    <View style={[styles.categoryMark, { backgroundColor: category.color || colors.primary }]} />
                    <Text style={styles.choiceText}>{category.name}</Text>
                    {selectedCategoryId === category.categoryId ? (
                      <Ionicons name="checkmark" size={22} color={colors.primary} />
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </View>
            {isLoading ? <ActivityIndicator color={colors.primary} style={styles.categoryLoading} /> : null}
            {!isLoading && categories.length === 0 ? (
              <Text style={styles.sheetHelperText}>No categories are available yet.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function CreateTaskScreen() {
  const navigation = useNavigation<CreateTaskNavigation>();
  const route = useRoute<CreateTaskRoute>();
  const insets = useSafeAreaInsets();
  const existingTaskId = route.params?.taskId;
  const fixedCategoryId = route.params?.fixedCategoryId;
  const fixedCategoryName = route.params?.fixedCategoryName;
  // Caregiver delegated: create the new task under a linked primary user
  // (editing an existing task derives the owner from the task itself).
  const managedOwnerId = route.params?.ownerId;
  const managingName = route.params?.managingName;
  const managed = Boolean(managedOwnerId) && !existingTaskId;
  // Interface setting: with categories disabled the picker is replaced by a
  // hint; an existing categoryId is left untouched on save.
  const { useCategories } = useInterfaceSettings();
  // From the Calendar "+" → "Start from scratch" flow: after creating the new
  // task, continue to scheduling it instead of returning to the task list.
  const scheduleAfterCreate = route.params?.scheduleAfterCreate ?? false;
  const createTaskMutation = useCreateTask();
  const deleteTaskMutation = useDeleteTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskStepMutation = useDeleteTaskStep();
  const createCoverUploadUrlMutation = useCreateTaskCoverImageUploadUrl();
  const deleteMediaAssetMutation = useDeleteMediaAsset();
  const createAiTaskMutation = useCreateAiTask();
  const createTaskStepMutation = useCreateTaskStep();
  const existingTaskQuery = useTask(existingTaskId ?? '');
  const [taskId, setTaskId] = useState<string>();
  const activeTaskId = existingTaskId ?? taskId ?? '';
  const existingStepsQuery = useTaskSteps(activeTaskId);
  const existingCoverQuery = useMediaDownloadUrl(
    activeTaskId,
    existingTaskQuery.data?.coverImageAssetId ?? '',
  );

  const [title, setTitle] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  // Drives the caret on the (multi-line) task-name field: jump to the end on
  // focus, snap back to the start on blur, otherwise leave it user-controlled.
  const [titleSelection, setTitleSelection] = useState<{ start: number; end: number }>();
  const titleCaretModeRef = useRef<'free' | 'end' | 'start'>('free');
  const [description, setDescription] = useState('');
  const [savedDescription, setSavedDescription] = useState('');
  const [descEditorVisible, setDescEditorVisible] = useState(false);
  const [coverImage, setCoverImage] = useState<SelectedImage>();
  const [coverPreviewUri, setCoverPreviewUri] = useState<string>();
  const [coverNeedsUpload, setCoverNeedsUpload] = useState(false);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [categoryOwnerId, setCategoryOwnerId] = useState(managed ? (managedOwnerId ?? '') : '');
  // Pre-pin to the fixed category when creating from a category view.
  const [categoryId, setCategoryId] = useState<string | undefined>(fixedCategoryId);
  const [savedCategoryId, setSavedCategoryId] = useState<string>();
  const [categorySheetVisible, setCategorySheetVisible] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<DraftStep>();
  const stepSwipeRefs = useRef<Map<string, Swipeable | null>>(new Map());
  const titleInputRef = useRef<TextInput>(null);
  const [isCreatedTaskDraft, setIsCreatedTaskDraft] = useState(false);
  const [isDraftCreationPending, setIsDraftCreationPending] = useState(false);
  const [discardDraftVisible, setDiscardDraftVisible] = useState(false);
  const [deleteCoverVisible, setDeleteCoverVisible] = useState(false);
  const [exitDestination, setExitDestination] = useState<'all-tasks' | 'back' | 'schedule'>();
  const [busyAction, setBusyAction] = useState<string>();
  const [inlineError, setInlineError] = useState<string>();
  const [aiStepsNotice, setAiStepsNotice] = useState(false);
  const [hydratedTaskId, setHydratedTaskId] = useState<string>();
  const categoriesQuery = useMyCategories(Boolean(categoryOwnerId), 50, categoryOwnerId);
  const taskOperationRef = useRef<string | undefined>(undefined);
  const draftCreationPromiseRef = useRef<Promise<string> | undefined>(undefined);

  const isBusy =
    Boolean(busyAction) ||
    createAiTaskMutation.isPending ||
    createTaskStepMutation.isPending ||
    createTaskMutation.isPending ||
    deleteTaskMutation.isPending ||
    updateTaskMutation.isPending ||
    deleteTaskStepMutation.isPending ||
    createCoverUploadUrlMutation.isPending ||
    deleteMediaAssetMutation.isPending;
  const trimmedTitle = title.trim();
  // When pinned to a category (and not editing), the picker is read-only.
  const categoryLocked = Boolean(fixedCategoryId) && !existingTaskId;
  const shouldConfirmDraftDiscard =
    !existingTaskId && (isCreatedTaskDraft || isDraftCreationPending);
  const categories = useMemo(
    () => categoriesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [categoriesQuery.data],
  );
  const selectedCategory = useMemo(
    () => categories.find((category) => category.categoryId === categoryId),
    [categories, categoryId],
  );
  const existingSteps = useMemo(
    () => existingStepsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [existingStepsQuery.data],
  );
  const isLoadingExistingTask = Boolean(existingTaskId) && (
    existingTaskQuery.isLoading || existingStepsQuery.isLoading
  );
  const taskCoverUri = coverImage?.uri ?? coverPreviewUri;

  useEffect(() => {
    const task = existingTaskQuery.data;
    if (!task || hydratedTaskId === task.taskId) {
      return;
    }

    setTaskId(task.taskId);
    setTitle(task.title);
    setSavedTitle(task.title);
    setDescription(task.description ?? '');
    setSavedDescription(task.description ?? '');
    setCategoryId(task.categoryId);
    setSavedCategoryId(task.categoryId);
    setCategoryOwnerId(task.ownerId);
    setHydratedTaskId(task.taskId);
  }, [existingTaskQuery.data, hydratedTaskId]);

  useEffect(() => {
    if (existingTaskId || taskId || categoryId) {
      return;
    }

    const defaultCategory = categories.find((category) => category.isDefault);
    if (defaultCategory) {
      setCategoryId(defaultCategory.categoryId);
    }
  }, [categories, categoryId, existingTaskId, taskId]);

  useEffect(() => {
    if (!activeTaskId || existingStepsQuery.isLoading) {
      return;
    }

    setSteps(
      [...existingSteps]
        .sort((first, second) => first.order - second.order)
        .map((step) => ({
          stepId: step.stepId,
          order: step.order,
          text: step.text,
          mediaAssets: step.mediaAssets,
        })),
    );
  }, [activeTaskId, existingSteps, existingStepsQuery.isLoading]);

  useFocusEffect(
    useCallback(() => {
      if (activeTaskId) {
        void existingStepsQuery.refetch();
      }
    }, [activeTaskId, existingStepsQuery.refetch]),
  );

  useEffect(() => {
    if (existingCoverQuery.data?.downloadUrl && !coverImage) {
      setCoverPreviewUri(existingCoverQuery.data.downloadUrl);
    }
  }, [coverImage, existingCoverQuery.data?.downloadUrl]);

  useEffect(() => {
    // Delegated create: the owner is the linked primary user from the route.
    if (managed && managedOwnerId) {
      setCategoryOwnerId(managedOwnerId);
      return;
    }
    let mounted = true;

    void getCurrentUserId()
      .then((ownerId) => {
        if (mounted) {
          setCategoryOwnerId(ownerId);
        }
      })
      .catch(() => {
        // Task creation remains available; omitting categoryId uses the server's default category.
      });

    return () => {
      mounted = false;
    };
  }, [managed, managedOwnerId]);

  const beginTaskOperation = (action: string) => {
    taskOperationRef.current = action;
    setBusyAction(action);
  };

  const endTaskOperation = (action: string) => {
    if (taskOperationRef.current === action) {
      taskOperationRef.current = undefined;
      setBusyAction(undefined);
    }
  };

  const createDraftTask = async (taskTitle: string): Promise<string> => {
    if (taskId) {
      return taskId;
    }
    if (draftCreationPromiseRef.current) {
      return draftCreationPromiseRef.current;
    }

    setIsDraftCreationPending(true);
    const creation = (async () => {
      const createdTask = await createTaskMutation.mutateAsync({
        title: taskTitle,
        ...(categoryId ? { categoryId } : {}),
        ...(managed && managedOwnerId ? { userId: managedOwnerId } : {}),
      });
      if (!createdTask) {
        throw new Error('Task creation returned no task. Please try again.');
      }

      setTaskId(createdTask.taskId);
      setSavedTitle(taskTitle);
      setCategoryId(createdTask.categoryId);
      setSavedCategoryId(createdTask.categoryId);
      setIsCreatedTaskDraft(true);
      return createdTask.taskId;
    })();
    draftCreationPromiseRef.current = creation;

    try {
      return await creation;
    } finally {
      if (draftCreationPromiseRef.current === creation) {
        draftCreationPromiseRef.current = undefined;
        setIsDraftCreationPending(false);
      }
    }
  };

  const handleTaskNameBlur = () => {
    if (taskId || !trimmedTitle || isBusy || taskOperationRef.current) {
      return;
    }

    const action = 'create-draft';
    beginTaskOperation(action);
    setInlineError(undefined);
    void (async () => {
      try {
        await createDraftTask(trimmedTitle);
      } catch (error) {
        setInlineError(errorMessage(error));
      } finally {
        endTaskOperation(action);
      }
    })();
  };

  // Tapping any empty area (header padding, gaps between cards, card whitespace)
  // deactivates the task-name field — which also scrolls the name back to start.
  const dismissTitleEditing = () => {
    titleInputRef.current?.blur();
  };

  UNSTABLE_usePreventRemove(
    shouldConfirmDraftDiscard && !exitDestination,
    () => {
      if (!isBusy && !taskOperationRef.current) {
        setDiscardDraftVisible(true);
      }
    },
  );

  useEffect(() => {
    if (!exitDestination || isBusy || shouldConfirmDraftDiscard) {
      return;
    }

    setExitDestination(undefined);
    if (exitDestination === 'schedule') {
      // The task was just created/saved — hand off to scheduling. `replace` so
      // back from the schedule screen returns to where CreateTask was opened.
      if (taskId) {
        navigation.replace('ScheduleAssignment', {
          taskId,
          taskTitle: title.trim() || undefined,
          ownerId: managedOwnerId,
          managingName,
        });
      } else {
        navigation.goBack();
      }
      return;
    }
    if (exitDestination === 'all-tasks') {
      if (fixedCategoryId) {
        // Return to the category view we came from (back from it → Categories).
        navigation.reset({
          index: 2,
          routes: [
            { name: 'Home' },
            { name: 'Categories' },
            {
              name: 'AllTasks',
              params: { categoryId: fixedCategoryId, categoryName: fixedCategoryName },
            },
          ],
        });
        return;
      }
      navigation.reset({
        index: 1,
        routes: [{ name: 'Home' }, { name: 'AllTasks' }],
      });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  }, [
    exitDestination,
    fixedCategoryId,
    fixedCategoryName,
    isBusy,
    navigation,
    shouldConfirmDraftDiscard,
    taskId,
    title,
  ]);

  const uploadCoverImage = async (id: string, image: SelectedImage) => {
    const contentType = contentTypeForImage(image);
    const target = await createCoverUploadUrlMutation.mutateAsync({
      contentType,
      fileName: fileNameForImage(image, contentType),
    });
    if (!target) {
      throw new Error('Could not prepare the task photo upload. Please try again.');
    }

    await uploadImageToPresignedUrl(image, target.uploadUrl, contentType);
    const updatedTask = await updateTaskMutation.mutateAsync({
      taskId: id,
      coverImageS3Key: target.s3Key,
    });
    if (!updatedTask) {
      throw new Error('Could not attach the task photo. Please try again.');
    }
  };

  const selectImage = async (source: 'camera' | 'library', onSelected: (image: SelectedImage) => Promise<void> | void) => {
    if (isBusy) {
      return;
    }

    setBusyAction('picker');
    setInlineError(undefined);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          source === 'camera'
            ? 'Camera permission was denied. Enable it in device settings to take a photo.'
            : 'Photo library permission was denied. Enable it in device settings to choose a photo.',
        );
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!result.canceled && result.assets[0]) {
        await onSelected(result.assets[0]);
      }
    } catch (error) {
      setInlineError(errorMessage(error));
    } finally {
      setBusyAction(undefined);
    }
  };

  const showImageSourceOptions = (onSelected: (image: SelectedImage) => Promise<void> | void) => {
    if (isBusy) {
      return;
    }
    Alert.alert('Add a photo', 'Choose how you would like to add an image.', [
      {
        text: 'Take photo',
        onPress: () => {
          void selectImage('camera', onSelected);
        },
      },
      {
        text: 'Choose from library',
        onPress: () => {
          void selectImage('library', onSelected);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCoverSelected = async (image: SelectedImage) => {
    setCoverImage(image);
    setCoverPreviewUri(image.uri);
    setCoverNeedsUpload(true);

    if (!taskId) {
      return;
    }

    await uploadCoverImage(taskId, image);
    setCoverNeedsUpload(false);
  };

  const handleRemoveCover = async () => {
    if (isBusy || (!coverImage && !coverPreviewUri)) {
      return;
    }

    if (!taskId) {
      setCoverImage(undefined);
      setCoverPreviewUri(undefined);
      setCoverNeedsUpload(false);
      setDeleteCoverVisible(false);
      return;
    }

    setBusyAction('cover');
    setInlineError(undefined);
    try {
      const coverAssetId = existingTaskQuery.data?.coverImageAssetId;
      if (coverAssetId) {
        await deleteMediaAssetMutation.mutateAsync({ taskId, assetId: coverAssetId });
      }
      const updatedTask = await updateTaskMutation.mutateAsync({ taskId, coverImageS3Key: null });
      if (!updatedTask) {
        throw new Error('Could not remove the task photo. Please try again.');
      }
      setCoverImage(undefined);
      setCoverPreviewUri(undefined);
      setCoverNeedsUpload(false);
      setDeleteCoverVisible(false);
    } catch (error) {
      setInlineError(errorMessage(error));
      setDeleteCoverVisible(false);
    } finally {
      setBusyAction(undefined);
    }
  };

  const handleSaveTask = async () => {
    if (
      !trimmedTitle ||
      taskOperationRef.current === 'save-task' ||
      (isBusy && !draftCreationPromiseRef.current)
    ) {
      return;
    }

    const action = 'save-task';
    beginTaskOperation(action);
    setInlineError(undefined);
    try {
      const id = taskId ?? await createDraftTask(trimmedTitle);

      const trimmedDescription = description.trim();
      const categoryChanged = categoryId !== savedCategoryId;
      const descriptionChanged = trimmedDescription !== savedDescription.trim();
      if (trimmedTitle !== savedTitle || categoryChanged || descriptionChanged) {
        const updatedTask = await updateTaskMutation.mutateAsync({
          taskId: id,
          ...(trimmedTitle !== savedTitle ? { title: trimmedTitle } : {}),
          ...(categoryChanged && categoryId ? { categoryId } : {}),
          ...(descriptionChanged ? { description: trimmedDescription || null } : {}),
        });
        if (!updatedTask) {
          throw new Error('Could not save the task changes. Please try again.');
        }
        setSavedTitle(trimmedTitle);
        setSavedCategoryId(categoryId);
        setSavedDescription(trimmedDescription);
      }

      if (coverImage && coverNeedsUpload) {
        await uploadCoverImage(id, coverImage);
        setCoverNeedsUpload(false);
      }
      setIsCreatedTaskDraft(false);
      // Editing → go back where we came from. New task → either continue to
      // scheduling (Calendar "Start from scratch" flow) or land on AllTasks.
      setExitDestination(
        existingTaskId ? 'back' : scheduleAfterCreate ? 'schedule' : 'all-tasks',
      );
    } catch (error) {
      setInlineError(errorMessage(error));
    } finally {
      endTaskOperation(action);
    }
  };

  const handleDeleteStep = async () => {
    if (!taskId || !stepToDelete || isBusy) {
      return;
    }

    setBusyAction('delete-step');
    setInlineError(undefined);
    try {
      const deletedStep = await deleteTaskStepMutation.mutateAsync({
        taskId,
        stepId: stepToDelete.stepId,
      });
      if (!deletedStep) {
        throw new Error('Step deletion returned no step. Please try again.');
      }
      setSteps((currentSteps) => currentSteps.filter((step) => step.stepId !== stepToDelete.stepId));
      setStepToDelete(undefined);
    } catch (error) {
      setInlineError(errorMessage(error));
      if (stepToDelete) {
        stepSwipeRefs.current.get(stepToDelete.stepId)?.close();
      }
      setStepToDelete(undefined);
    } finally {
      setBusyAction(undefined);
    }
  };

  const handleGenerateAiSteps = async () => {
    if (!taskId || !trimmedTitle || isBusy || steps.length > 0) {
      return;
    }

    setBusyAction('ai-steps');
    setInlineError(undefined);
    setAiStepsNotice(false);
    try {
      const generated = await createAiTaskMutation.mutateAsync({
        query: trimmedTitle,
        groundingMode: 'ALLOW_UNGROUNDED_FALLBACK',
      });
      const stepTexts = generated.steps
        .map((generatedStep) => generatedStep.text.trim())
        .filter((text) => text.length > 0);
      if (stepTexts.length === 0) {
        throw new Error('AI could not create steps for this task. Please try again or add steps yourself.');
      }
      // Set before persisting: the notice only renders once steps exist, and a
      // partially created batch is still AI-generated.
      if (!generated.grounded) {
        setAiStepsNotice(true);
      }

      // This screen's steps are server-backed (synced from useTaskSteps), so
      // persist each generated step; local-only entries would be overwritten.
      // Append to local state per step so a partial failure still shows what
      // was created and the AI card stays hidden instead of re-creating order 1.
      for (const [index, text] of stepTexts.entries()) {
        const createdStep = await createTaskStepMutation.mutateAsync({
          taskId,
          order: index + 1,
          text,
        });
        if (!createdStep) {
          throw new Error('Some steps could not be added. Please review the list below.');
        }
        setSteps((currentSteps) => [
          ...currentSteps,
          {
            stepId: createdStep.stepId,
            order: createdStep.order,
            text: createdStep.text,
            mediaAssets: createdStep.mediaAssets,
          },
        ]);
      }
    } catch (error) {
      setInlineError(errorMessage(error));
    } finally {
      setBusyAction(undefined);
    }
  };

  const handleDiscardDraft = async () => {
    if (!taskId || isBusy) {
      return;
    }

    const action = 'discard-draft';
    beginTaskOperation(action);
    setInlineError(undefined);
    try {
      const deletedTask = await deleteTaskMutation.mutateAsync(taskId);
      if (!deletedTask) {
        throw new Error('Could not discard this task. Please try again.');
      }
      setDiscardDraftVisible(false);
      setIsCreatedTaskDraft(false);
      setExitDestination('back');
    } catch (error) {
      setInlineError(errorMessage(error));
    } finally {
      endTaskOperation(action);
    }
  };

  const handleBack = () => {
    if (isBusy || taskOperationRef.current) {
      return;
    }
    if (shouldConfirmDraftDiscard) {
      setDiscardDraftVisible(true);
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  };

  const openStepEditor = (stepId?: string) => {
    if (isBusy) {
      return;
    }
    if (!taskId) {
      if (trimmedTitle) {
        Alert.alert(
          'Creating your task',
          'Your task name is being saved. You can add steps as soon as it is ready.',
        );
        return;
      }
      Alert.alert(
        'Add a task name first',
        'Enter a task name and tap outside the field to create the task before adding or editing steps.',
      );
      return;
    }
    navigation.navigate('CreateTaskStep', { taskId, ...(stepId ? { stepId } : {}) });
  };

  if (isLoadingExistingTask) {
    return (
      <View style={styles.editorLoadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.editorLoadingText}>Loading task…</Text>
      </View>
    );
  }

  if (existingTaskId && (existingTaskQuery.error || !existingTaskQuery.data)) {
    return (
      <View style={styles.editorLoadingState}>
        <Ionicons name="alert-circle" size={36} color={colors.danger} />
        <Text accessibilityRole="alert" style={styles.editorLoadingText}>
          {existingTaskQuery.error?.message || 'This task could not be found.'}
        </Text>
        <BackButton onPress={handleBack} variant="dark" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessible={false}
          onPress={dismissTitleEditing}
          style={StyleSheet.absoluteFill}
        />
        <BackButton onPress={handleBack} variant="dark" />
        <Text style={styles.headerTitle}>{existingTaskId ? 'Edit Task' : 'New Task'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save task"
          accessibilityState={{ disabled: !trimmedTitle || isBusy, busy: isBusy }}
          disabled={!trimmedTitle || isBusy}
          onPress={() => {
            void handleSaveTask();
          }}
          style={({ pressed }) => [
            styles.saveButton,
            !trimmedTitle || isBusy ? styles.saveButtonDisabled : null,
            pressed && trimmedTitle && !isBusy ? styles.primaryPressed : null,
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <Text style={styles.saveButtonText}>Save</Text>
              <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
            </>
          )}
        </Pressable>
      </View>

      {managed && managingName ? (
        <Text style={styles.managingBanner} numberOfLines={1}>
          Managing {managingName}
        </Text>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessible={false}
          onPress={dismissTitleEditing}
          style={StyleSheet.absoluteFill}
        />
        {inlineError ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{inlineError}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Task name</Text>
          <TextInput
            ref={titleInputRef}
            accessibilityLabel="Task name"
            editable={!isBusy}
            value={title}
            // Keep the name a single logical line — wrap visually, but drop any
            // newline the user might enter on the multi-line field.
            onChangeText={(text) => setTitle(text.replace(/\n/g, ''))}
            placeholder="e.g. Make breakfast"
            placeholderTextColor={colors.disabled}
            style={styles.taskTitleInput}
            multiline
            scrollEnabled
            textAlignVertical="top"
            selection={titleSelection}
            onFocus={() => {
              titleCaretModeRef.current = 'end';
              const end = title.length;
              setTitleSelection({ start: end, end });
            }}
            onSelectionChange={() => {
              if (titleCaretModeRef.current === 'end') {
                titleCaretModeRef.current = 'free';
                setTitleSelection(undefined);
              }
            }}
            onBlur={() => {
              titleCaretModeRef.current = 'start';
              setTitleSelection({ start: 0, end: 0 });
              handleTaskNameBlur();
            }}
          />
        </View>

        {/* isSuccess: never offer AI steps until the server confirms the task has none
            (a failed steps query would otherwise leave steps=[] for a task that has some). */}
        {taskId && existingStepsQuery.isSuccess && (steps.length === 0 || busyAction === 'ai-steps') ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create steps with AI"
            accessibilityState={{ disabled: isBusy, busy: busyAction === 'ai-steps' }}
            disabled={isBusy}
            onPress={() => {
              void handleGenerateAiSteps();
            }}
            style={({ pressed }) => [
              styles.aiSuggestCard,
              pressed && !isBusy ? styles.addPhotoActionPressed : null,
              isBusy && busyAction !== 'ai-steps' ? styles.controlDisabled : null,
            ]}
          >
            {busyAction === 'ai-steps' ? (
              <>
                <ActivityIndicator color={colors.primary} />
                <View style={styles.aiSuggestCopy}>
                  <Text style={styles.aiSuggestTitle}>Creating steps…</Text>
                  <Text style={styles.aiSuggestDescription}>This can take a few seconds.</Text>
                </View>
              </>
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
                <View style={styles.aiSuggestCopy}>
                  <Text style={styles.aiSuggestTitle}>Create the steps with AI</Text>
                  <Text style={styles.aiSuggestDescription}>
                    Tap to let AI suggest steps. You can edit or delete them after.
                  </Text>
                </View>
              </>
            )}
          </Pressable>
        ) : null}
        {steps.length > 0 && aiStepsNotice ? (
          <View accessibilityRole="alert" style={styles.aiNotice}>
            <Ionicons name="sparkles-outline" size={18} color={colors.warning} />
            <Text style={styles.aiNoticeText}>
              These steps were created by AI, not from CanPlan&apos;s guidance. Please check each one.
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit task description"
          disabled={isBusy}
          onPress={() => {
            titleInputRef.current?.blur();
            setDescEditorVisible(true);
          }}
          style={({ pressed }) => [
            styles.card,
            styles.descriptionCard,
            pressed && !isBusy ? styles.pressed : null,
          ]}
        >
          <Text style={styles.sectionLabel}>Description (Optional)</Text>
          <Text style={[styles.descriptionPreview, description.trim() ? null : styles.descriptionPlaceholder]}>
            {description.trim() ? description : 'Add more details about this task...'}
          </Text>
        </Pressable>

        <View style={[styles.card, styles.photoCard]}>
          <Text style={styles.sectionLabel}>Task photo</Text>
          {taskCoverUri ? (
            <View style={styles.coverPreview}>
              <CachedImage
                accessibilityLabel="Selected task photo"
                uri={taskCoverUri ?? null}
                cacheKey={coverImage?.uri ?? existingTaskQuery.data?.coverImageAssetId ?? ''}
                style={styles.coverImage}
                contentFit="cover"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove task photo"
                disabled={isBusy}
                onPress={() => setDeleteCoverVisible(true)}
                style={({ pressed }) => [styles.removePhotoButton, pressed && !isBusy ? styles.pressed : null]}
              >
                <Ionicons name="close" size={18} color={colors.onPrimary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change task photo"
                disabled={isBusy}
                onPress={() => showImageSourceOptions(handleCoverSelected)}
                style={({ pressed }) => [styles.changePhotoButton, pressed && !isBusy ? styles.pressed : null]}
              >
                <Ionicons name="camera-outline" size={16} color={colors.onPrimary} />
                <Text style={styles.changePhotoText}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a task photo"
              disabled={isBusy}
              onPress={() => showImageSourceOptions(handleCoverSelected)}
              style={({ pressed }) => [
                styles.addTaskPhoto,
                pressed && !isBusy ? styles.addPhotoActionPressed : null,
                isBusy ? styles.controlDisabled : null,
              ]}
            >
              <Ionicons name="camera-outline" size={32} color={colors.primary} />
              <Text style={styles.addTaskPhotoText}>Add a photo</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.stepsHeading}>
            <Text style={styles.sectionLabel}>Steps</Text>
            {steps.length > 1 && activeTaskId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reorder steps"
                onPress={() => navigation.navigate('ReorderSteps', { taskId: activeTaskId })}
                style={({ pressed }) => [styles.reorderChip, pressed ? styles.reorderChipPressed : null]}
              >
                <Text style={styles.reorderChipText}>Reorder</Text>
              </Pressable>
            ) : null}
          </View>
          {!taskId ? <Text style={styles.stepHint}>Add a task name to unlock steps.</Text> : null}

          <View style={styles.stepList}>
            {steps.map((step, index) => (
              <Swipeable
                key={step.stepId}
                ref={(ref) => {
                  stepSwipeRefs.current.set(step.stepId, ref);
                }}
                friction={2}
                rightThreshold={48}
                renderRightActions={() => (
                  <View style={styles.swipeDeleteAction}>
                    <Ionicons name="trash-outline" size={22} color={colors.onPrimary} />
                    <Text style={styles.swipeDeleteText}>Delete</Text>
                  </View>
                )}
                onSwipeableOpen={() => {
                  if (!isBusy) setStepToDelete(step);
                }}
              >
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.stepCopy}>
                    <Text style={styles.stepText}>{step.text}</Text>
                    {(() => {
                      const indicators = stepMediaIndicators(step.mediaAssets);
                      if (indicators.length === 0) {
                        return null;
                      }
                      return (
                        <View style={styles.mediaIndicatorRow}>
                          {indicators.map((item, indicatorIndex) => (
                            <Fragment key={item.label}>
                              {indicatorIndex > 0 ? (
                                <Ionicons name="add" size={14} color={colors.textMuted} />
                              ) : null}
                              <View style={styles.photoIndicator}>
                                <Ionicons name={item.icon} size={13} color={colors.textMuted} />
                                <Text style={styles.photoIndicatorText}>{item.label}</Text>
                              </View>
                            </Fragment>
                          ))}
                        </View>
                      );
                    })()}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit step ${index + 1}`}
                    disabled={isBusy}
                    onPress={() => openStepEditor(step.stepId)}
                    style={({ pressed }) => [
                      styles.editStepButton,
                      pressed && !isBusy ? styles.addPhotoActionPressed : null,
                      isBusy ? styles.controlDisabled : null,
                    ]}
                  >
                    <Text style={styles.editStepText}>Edit</Text>
                  </Pressable>
                </View>
              </Swipeable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={taskId ? 'Add a step' : 'Add a task name first to add steps'}
            accessibilityHint={taskId ? undefined : 'Shows a message explaining that a task name is required first.'}
            accessibilityState={{ disabled: isBusy }}
            disabled={isBusy}
            onPress={() => openStepEditor()}
            style={({ pressed }) => [
              styles.addStepButton,
              pressed && taskId && !isBusy ? styles.addPhotoActionPressed : null,
              !taskId || isBusy ? styles.controlDisabled : null,
            ]}
          >
            <Ionicons name="add" size={22} color={taskId && !isBusy ? colors.primary : colors.disabled} />
            <Text style={[styles.addStepText, !taskId || isBusy ? styles.disabledText : null]}>Add a Step</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Category</Text>
          {!useCategories ? (
            <Text style={styles.stepHint}>
              You must enable categories to select a category.
            </Text>
          ) : (
          <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={categoryLocked ? 'Category (fixed)' : 'Choose a category'}
            accessibilityState={{ disabled: isBusy || categoryLocked }}
            disabled={isBusy || categoryLocked}
            onPress={categoryLocked ? undefined : () => setCategorySheetVisible(true)}
            style={({ pressed }) => [
              styles.selectionRow,
              pressed && !isBusy && !categoryLocked ? styles.selectionRowPressed : null,
              isBusy ? styles.controlDisabled : null,
            ]}
          >
            {selectedCategory ? (
              <View style={[styles.selectedCategoryMark, { backgroundColor: selectedCategory.color || colors.primary }]} />
            ) : null}
            <Text style={[styles.selectionText, selectedCategory ? styles.selectionTextActive : null]}>
              {selectedCategory?.name || fixedCategoryName || 'No Category'}
            </Text>
            <Ionicons
              name={categoryLocked ? 'lock-closed' : 'chevron-forward'}
              size={categoryLocked ? 18 : 24}
              color={colors.disabled}
            />
          </Pressable>
          {categoryLocked ? (
            <Text style={styles.stepHint}>
              This task will be added to “{selectedCategory?.name || fixedCategoryName}”.
            </Text>
          ) : null}
          </>
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={discardDraftVisible}
        title="Discard new task?"
        message="This will permanently delete this task and any steps or photos added to it. This cannot be undone."
        confirmLabel={deleteTaskMutation.isPending ? 'Discarding…' : 'Discard task'}
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          void handleDiscardDraft();
        }}
        onCancel={() => {
          if (!deleteTaskMutation.isPending) {
            setDiscardDraftVisible(false);
          }
        }}
      />
      <ConfirmDialog
        visible={deleteCoverVisible}
        title="Remove task photo?"
        message="This will permanently delete the photo from the task. This cannot be undone."
        confirmLabel={deleteMediaAssetMutation.isPending || busyAction === 'cover' ? 'Removing…' : 'Remove photo'}
        cancelLabel="Keep photo"
        destructive
        onConfirm={() => {
          void handleRemoveCover();
        }}
        onCancel={() => {
          if (!deleteMediaAssetMutation.isPending && busyAction !== 'cover') {
            setDeleteCoverVisible(false);
          }
        }}
      />
      <ConfirmDialog
        visible={Boolean(stepToDelete)}
        title={`Delete “${stepToDelete?.text ?? ''}”?`}
        message="The step and its photo will be permanently removed."
        confirmLabel={deleteTaskStepMutation.isPending ? 'Deleting…' : 'Delete Step'}
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void handleDeleteStep();
        }}
        onCancel={() => {
          if (!deleteTaskStepMutation.isPending) {
            if (stepToDelete) {
              stepSwipeRefs.current.get(stepToDelete.stepId)?.close();
            }
            setStepToDelete(undefined);
          }
        }}
      />
      <CategorySheet
        visible={categorySheetVisible}
        categories={categories}
        isLoading={categoriesQuery.isLoading}
        selectedCategoryId={categoryId}
        busy={isBusy}
        onCancel={() => setCategorySheetVisible(false)}
        onSelect={(nextCategoryId) => {
          setCategoryId(nextCategoryId);
          setCategorySheetVisible(false);
        }}
      />

      {/* ── Description editor (rises above the keyboard) ── */}
      <Modal
        visible={descEditorVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDescEditorVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.descEditorRoot}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close description editor"
            onPress={() => setDescEditorVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.descEditorSheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.descEditorHeader}>
              <Text style={styles.descEditorTitle}>Description</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done editing description"
                onPress={() => setDescEditorVisible(false)}
                style={({ pressed }) => [styles.descEditorDoneBtn, pressed ? styles.pressed : null]}
              >
                <Text style={styles.descEditorDoneText}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Task description"
              autoFocus
              value={description}
              onChangeText={setDescription}
              placeholder="Add more details about this task..."
              placeholderTextColor={colors.disabled}
              style={styles.descEditorInput}
              multiline
              textAlignVertical="top"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  editorLoadingState: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  editorLoadingText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
    ...typography.display,
    color: colors.text,
  },
  // Delegated context strip — mirrors the caregiver overview "Managing {name}".
  managingBanner: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    ...typography.bodyStrong,
    color: colors.text,
    textAlign: 'center',
  },
  saveButton: {
    minWidth: 104,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  saveButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  saveButtonText: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FEE8E8',
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    ...typography.caption,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg + spacing.md,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  photoCard: {
    gap: spacing.md,
  },
  descriptionCard: {
    gap: spacing.sm,
  },
  descriptionPreview: {
    ...typography.body,
    color: colors.text,
    minHeight: 44,
  },
  descriptionPlaceholder: {
    color: colors.disabled,
  },
  descEditorRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 14, 6, 0.45)',
  },
  descEditorSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + spacing.xs,
    borderTopRightRadius: radius.lg + spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  descEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  descEditorTitle: {
    ...typography.heading,
    color: colors.text,
  },
  descEditorDoneBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  descEditorDoneText: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
  },
  descEditorInput: {
    ...typography.body,
    color: colors.text,
    minHeight: 120,
    maxHeight: 240,
    paddingVertical: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  taskTitleInput: {
    ...typography.title,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: colors.text,
    paddingVertical: spacing.sm,
    minHeight: 54,
    // Up to ~3 lines (38 × 3 + vertical padding); longer names scroll in-place.
    maxHeight: 130,
  },
  addTaskPhoto: {
    minHeight: 184,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(224, 119, 68, 0.45)',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  addTaskPhotoText: {
    ...typography.heading,
    color: colors.primary,
  },
  coverPreview: {
    height: 184,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(27, 34, 48, 0.7)',
  },
  changePhotoButton: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(27, 34, 48, 0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  changePhotoText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  stepsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepsStatus: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.success,
  },
  reorderChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
  },
  reorderChipPressed: {
    opacity: 0.7,
  },
  swipeDeleteAction: {
    width: 96,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  swipeDeleteText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  reorderChipText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  stepHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  stepList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
  stepText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  mediaIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  photoIndicatorText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  editStepButton: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  editStepText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  deleteStepButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE8E8',
  },
  deleteStepPressed: {
    opacity: 0.72,
  },
  addStepButton: {
    minHeight: 76,
    marginTop: spacing.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(224, 119, 68, 0.45)',
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addStepText: {
    ...typography.heading,
    color: colors.primary,
  },
  aiSuggestCard: {
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg + spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceWarm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  aiSuggestCopy: {
    flex: 1,
  },
  aiSuggestTitle: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  aiSuggestDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  aiNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(181, 104, 11, 0.08)',
  },
  aiNoticeText: {
    flex: 1,
    ...typography.caption,
    color: colors.warning,
  },
  disabledText: {
    color: colors.disabled,
  },
  controlDisabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
  primaryPressed: {
    backgroundColor: colors.primaryDark,
  },
  addPhotoActionPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  selectionRow: {
    minHeight: 88,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  selectionRowPressed: {
    backgroundColor: colors.border,
  },
  selectionText: {
    flex: 1,
    ...typography.heading,
    color: colors.textMuted,
  },
  selectionTextActive: {
    color: colors.text,
  },
  selectedCategoryMark: {
    width: 12,
    height: 38,
    borderRadius: radius.pill,
  },
  sheetKeyboardAvoider: {
    flex: 1,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(27, 34, 48, 0.48)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.lg + spacing.md,
    borderTopRightRadius: radius.lg + spacing.md,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.disabled,
  },
  sheetHeader: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTextButton: {
    minWidth: 70,
    minHeight: 40,
    justifyContent: 'center',
  },
  cancelText: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  sheetTitle: {
    ...typography.heading,
    color: colors.text,
  },
  sheetContent: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  choiceSheetContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  choiceList: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceRow: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  choiceRowPressed: {
    backgroundColor: colors.bg,
  },
  choiceText: {
    flex: 1,
    ...typography.bodyStrong,
    color: colors.text,
  },
  choiceDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.border,
  },
  categoryMark: {
    width: 12,
    height: 34,
    borderRadius: radius.pill,
  },
  categoryLoading: {
    marginVertical: spacing.lg,
  },
  sheetHelperText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  editorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepTextInput: {
    ...typography.heading,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  addPhotoAction: {
    minHeight: 96,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addPhotoCopy: {
    flex: 1,
  },
  addPhotoTitle: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  addPhotoDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  editorPhotoPreview: {
    height: 136,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  editorPhotoImage: {
    width: '100%',
    height: '100%',
  },
  sheetPrimaryButton: {
    minHeight: 56,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sheetPrimaryButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  sheetPrimaryButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
});
