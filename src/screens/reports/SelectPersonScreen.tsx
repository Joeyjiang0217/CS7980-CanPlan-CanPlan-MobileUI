import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useLinkedPrimaryUsers,
  type LinkedPrimaryUser,
} from '../../features/reports/hooks/useReports';
import type { MainStackParamList } from '../../navigation/types';
import { getCurrentUserId } from '../../shared/api/authTokenProvider';
import BackButton from '../../shared/components/BackButton';
import PrimaryButton from '../../shared/components/PrimaryButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type SelectPersonNavigation = NativeStackNavigationProp<MainStackParamList, 'ReportPeople'>;

/** Fallback label when a linked user has no profile yet: short id stub. */
function nameFor(person: LinkedPrimaryUser): string {
  return person.displayName ?? `User ${person.userId.slice(0, 8)}`;
}

export default function SelectPersonScreen() {
  const navigation = useNavigation<SelectPersonNavigation>();
  const insets = useSafeAreaInsets();

  const [supporterId, setSupporterId] = useState('');
  const [identityError, setIdentityError] = useState<string>();

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

  const peopleQuery = useLinkedPrimaryUsers(supporterId);
  const loading = !identityError && (supporterId === '' || peopleQuery.isLoading);

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton variant="dark" onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Reports</Text>
        <View style={styles.topSpacer} />
      </View>
      <Text style={styles.prompt}>Whose progress would you like to see?</Text>

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
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('Reports', {
                  userId: item.userId,
                  displayName: nameFor(item),
                })
              }
              style={({ pressed }) => [
                styles.personCard,
                pressed ? styles.cardPressed : null,
              ]}
            >
              <Text style={styles.personName} numberOfLines={1}>
                {nameFor(item)}
              </Text>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No one is linked to your account yet, so there are no reports to show.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  topTitle: {
    ...typography.heading,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  topSpacer: {
    width: 42,
  },
  prompt: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  personName: {
    ...typography.bodyStrong,
    color: colors.text,
    flexShrink: 1,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
