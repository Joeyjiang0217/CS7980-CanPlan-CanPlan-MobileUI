import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainStackParamList } from '../../navigation/types';
import BackButton from '../../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';
import { avatarColorFor, initialsFor } from './patientAvatar';

type PatientOverviewRoute = RouteProp<MainStackParamList, 'PatientOverview'>;
type PatientOverviewNavigation = NativeStackNavigationProp<
  MainStackParamList,
  'PatientOverview'
>;

type IoniconName = keyof typeof Ionicons.glyphMap;

function SectionCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IoniconName;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        disabled ? styles.cardDisabled : null,
        pressed && !disabled ? styles.cardPressed : null,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: disabled ? colors.surfaceWarm : colors.primary },
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={disabled ? colors.textMuted : colors.onPrimary}
        />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={[styles.cardTitle, disabled ? styles.textMutedColor : null]}>
          {title}
        </Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      {disabled ? (
        <Text style={styles.soonBadge}>Soon</Text>
      ) : (
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

export default function PatientOverviewScreen() {
  const navigation = useNavigation<PatientOverviewNavigation>();
  const route = useRoute<PatientOverviewRoute>();
  const insets = useSafeAreaInsets();
  const { userId, displayName } = route.params;

  return (
    <View style={styles.root}>
      {/* "Managing {name}" banner + back to the caregiver dashboard. */}
      <View style={[styles.banner, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton variant="dark" onPress={() => navigation.goBack()} />
        <Text style={styles.bannerText} numberOfLines={1}>
          Managing {displayName}
        </Text>
        <View style={styles.bannerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <View style={styles.identity}>
          <View
            style={[styles.avatar, { backgroundColor: avatarColorFor(userId) }]}
          >
            <Text style={styles.avatarText}>{initialsFor(displayName)}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        <View style={styles.cardList}>
          <SectionCard
            icon="document-text-outline"
            title="Progress reports"
            subtitle="View and generate progress reports"
            onPress={() =>
              navigation.navigate('Reports', { userId, displayName })
            }
          />
          <SectionCard
            icon="list-outline"
            title="Tasks"
            subtitle="View, add, and edit this person's tasks"
            onPress={() =>
              navigation.navigate('AllTasks', { ownerId: userId, managingName: displayName })
            }
          />
          <SectionCard
            icon="grid-outline"
            title="Categories"
            subtitle="View and manage this person's categories"
            onPress={() =>
              navigation.navigate('Categories', { ownerId: userId, managingName: displayName })
            }
          />
          <SectionCard
            icon="calendar-outline"
            title="Calendar"
            subtitle="View and schedule this person's tasks by date"
            onPress={() =>
              navigation.navigate('Calendar', { ownerId: userId, managingName: displayName })
            }
          />
        </View>
      </ScrollView>
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceWarm,
  },
  bannerText: {
    ...typography.bodyStrong,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  bannerSpacer: {
    width: 42,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.title,
    color: colors.onPrimary,
  },
  name: {
    ...typography.heading,
    color: colors.text,
  },
  cardList: {
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
  cardDisabled: {
    opacity: 0.6,
  },
  cardPressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  textMutedColor: {
    color: colors.textMuted,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  soonBadge: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
