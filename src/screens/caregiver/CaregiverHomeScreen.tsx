import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../../app/SessionContext';
import { useCurrentUser, useSignOut } from '../../features/auth';
import {
  useLinkedPrimaryUsers,
  type LinkedPrimaryUser,
} from '../../features/reports/hooks/useReports';
import { useMyProfile } from '../../features/users/hooks/useMyProfile';
import {
  useMyOrganizationUsers,
  useSelectPrimaryUser,
} from '../../features/users/hooks/useUserApi';
import type { MainStackParamList } from '../../navigation/types';
import type { UserProfile } from '../../shared/api/canplanTypes';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import PrimaryButton from '../../shared/components/PrimaryButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';
import { avatarColorFor, initialsFor } from './patientAvatar';

type CaregiverHomeNavigation = NativeStackNavigationProp<
  MainStackParamList,
  'CaregiverHome'
>;

/** Fallback label when a linked user has no profile yet: short id stub. */
function nameFor(person: LinkedPrimaryUser): string {
  return person.displayName ?? `User ${person.userId.slice(0, 8)}`;
}

function PatientCard({
  person,
  onPress,
}: {
  person: LinkedPrimaryUser;
  onPress: () => void;
}) {
  const name = nameFor(person);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColorFor(person.userId) }]}>
        <Text style={styles.avatarText}>{initialsFor(name)}</Text>
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={styles.cardName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          View progress reports
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

export default function CaregiverHomeScreen() {
  const navigation = useNavigation<CaregiverHomeNavigation>();
  const insets = useSafeAreaInsets();
  const { isGuest, exitGuestMode } = useSession();
  const { data: currentUser } = useCurrentUser();
  const { data: profile } = useMyProfile({ enabled: !!currentUser && !isGuest });
  const signOutMutation = useSignOut();

  const [supporterId, setSupporterId] = useState('');
  const [identityError, setIdentityError] = useState<string>();
  const [confirmVisible, setConfirmVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getCurrentUserId()
      .then((userId) => mounted && setSupporterId(userId))
      .catch(
        (error: unknown) =>
          mounted &&
          setIdentityError(
            error instanceof Error ? error.message : 'Could not load your account.',
          ),
      );
    return () => {
      mounted = false;
    };
  }, []);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [],
  );

  const greetingName = profile?.displayName?.trim() || 'there';

  const peopleQuery = useLinkedPrimaryUsers(supporterId);
  const loading = !identityError && (supporterId === '' || peopleQuery.isLoading);

  // "Add a person" flow: pick a PRIMARY_USER from the caller's organization
  // (that isn't already linked or the caller themselves) and link them.
  const [addVisible, setAddVisible] = useState(false);
  const orgQuery = useMyOrganizationUsers(addVisible);
  const selectMutation = useSelectPrimaryUser();

  const linkedIds = useMemo(
    () => new Set((peopleQuery.data ?? []).map((p) => p.userId)),
    [peopleQuery.data],
  );
  const candidates = useMemo<UserProfile[]>(() => {
    const all = orgQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return all.filter(
      (u) =>
        u.role === 'PRIMARY_USER' &&
        u.userId !== supporterId &&
        !linkedIds.has(u.userId),
    );
  }, [orgQuery.data, supporterId, linkedIds]);

  const handleLink = (userId: string) => {
    selectMutation.mutate(userId, {
      onSuccess: () => {
        setAddVisible(false);
        void peopleQuery.refetch();
      },
      onError: (error: unknown) =>
        Alert.alert(
          'Could not add this person',
          error instanceof Error ? error.message : 'Please try again.',
        ),
    });
  };

  const handleConfirmSignOut = () => {
    setConfirmVisible(false);
    // Defer the auth-state change so the modal's close animation finishes
    // before this screen unmounts (mirrors HomeScreen — tearing the screen
    // down mid-animation can crash the native modal controller on iOS).
    setTimeout(() => {
      exitGuestMode();
      if (currentUser) {
        signOutMutation.mutate();
      }
    }, 250);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.topRow}>
          <Text style={styles.date}>{dateLabel}</Text>
          <View style={styles.topActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => navigation.navigate('Settings')}
              style={({ pressed }) => [styles.iconBtn, pressed ? styles.chipPressed : null]}
              hitSlop={6}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmVisible(true)}
              style={({ pressed }) => [styles.signOutChip, pressed ? styles.chipPressed : null]}
              hitSlop={6}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.greeting}>Hi {greetingName}!</Text>
        <Text style={styles.prompt}>Here are the people you support.</Text>

        {!identityError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAddVisible(true)}
            style={({ pressed }) => [styles.addBtn, pressed ? styles.addBtnPressed : null]}
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addBtnText}>Add a person</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : identityError || peopleQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {identityError ?? 'Could not load the people you support.'}
          </Text>
          {peopleQuery.isError ? (
            <PrimaryButton
              label="Retry"
              onPress={() => void peopleQuery.refetch()}
              style={styles.retryBtn}
            />
          ) : null}
        </View>
      ) : (
        <FlatList
          data={peopleQuery.data ?? []}
          keyExtractor={(person) => person.userId}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          renderItem={({ item }) => (
            <PatientCard
              person={item}
              onPress={() =>
                navigation.navigate('PatientOverview', {
                  userId: item.userId,
                  displayName: nameFor(item),
                })
              }
            />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No one is linked to your account yet. Once someone adds you as their
              support person, they will show up here.
            </Text>
          }
        />
      )}

      <ConfirmDialog
        visible={confirmVisible}
        title="Sign out?"
        message="You will need to sign in again next time."
        confirmLabel="Yes, sign out"
        cancelLabel="Stay signed in"
        destructive
        onConfirm={handleConfirmSignOut}
        onCancel={() => setConfirmVisible(false)}
      />

      <Modal
        visible={addVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddVisible(false)}
      >
        <View style={styles.root}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
            <Text style={styles.modalTitle}>Add a person</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setAddVisible(false)}
              hitSlop={8}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.modalPrompt}>
            People in your organization you can support.
          </Text>

          {orgQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : orgQuery.isError ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>Could not load your organization.</Text>
              <PrimaryButton
                label="Retry"
                onPress={() => void orgQuery.refetch()}
                style={styles.retryBtn}
              />
            </View>
          ) : (
            <FlatList
              data={candidates}
              keyExtractor={(u) => u.userId}
              contentContainerStyle={[
                styles.list,
                { paddingBottom: insets.bottom + spacing.xxl },
              ]}
              renderItem={({ item }) => {
                const name = item.displayName?.trim() || `User ${item.userId.slice(0, 8)}`;
                const linking = selectMutation.isPending && selectMutation.variables === item.userId;
                return (
                  <View style={styles.card}>
                    <View style={[styles.avatar, { backgroundColor: avatarColorFor(item.userId) }]}>
                      <Text style={styles.avatarText}>{initialsFor(name)}</Text>
                    </View>
                    <Text style={[styles.cardName, styles.candidateName]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${name}`}
                      disabled={selectMutation.isPending}
                      onPress={() => handleLink(item.userId)}
                      style={({ pressed }) => [styles.linkBtn, pressed ? styles.addBtnPressed : null]}
                    >
                      {linking ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Text style={styles.linkBtnText}>Add</Text>
                      )}
                    </Pressable>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No one else in your organization to add right now.
                </Text>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  date: {
    ...typography.body,
    color: colors.textMuted,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutChip: {
    paddingHorizontal: spacing.lg,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPressed: {
    backgroundColor: colors.border,
  },
  signOutText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  greeting: {
    ...typography.display,
    color: colors.text,
  },
  prompt: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addBtnPressed: {
    opacity: 0.8,
  },
  addBtnText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.heading,
    color: colors.text,
  },
  modalPrompt: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  candidateName: {
    flex: 1,
  },
  linkBtn: {
    minWidth: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtnText: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  retryBtn: {
    alignSelf: 'stretch',
  },
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardName: {
    ...typography.title,
    color: colors.text,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
});
