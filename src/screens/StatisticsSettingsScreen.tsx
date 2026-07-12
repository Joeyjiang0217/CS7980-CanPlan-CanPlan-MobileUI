import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainStackParamList } from '../navigation/types';
import BackButton from '../shared/components/BackButton';
import { colors, radius, shadow, spacing, typography } from '../shared/theme/tokens';

type StatisticsNavigation = NativeStackNavigationProp<MainStackParamList, 'Statistics'>;

// UI-only for now — placeholder values until the real stats are wired up.
const STATS: Array<{ label: string; value: string }> = [
  { label: 'Install Date', value: '2026-06-19' },
  { label: 'Steps Completed', value: '30' },
  { label: 'Tasks Completed', value: '3' },
  { label: 'Days Active', value: '1' },
];

export default function StatisticsSettingsScreen() {
  const navigation = useNavigation<StatisticsNavigation>();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} variant="dark" />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Statistics
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {STATS.map((stat, index) => (
            <Fragment key={stat.label}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{stat.label}</Text>
                <Text style={styles.rowValue}>{stat.value}</Text>
              </View>
            </Fragment>
          ))}
        </View>

        <Text style={styles.credit}>
          Made at CanAssist by Caelum Dudek and Joe McDonald
        </Text>
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
    paddingTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: 64,
  },
  rowLabel: {
    ...typography.heading,
    color: colors.text,
  },
  rowValue: {
    ...typography.heading,
    fontWeight: '400',
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  credit: {
    ...typography.body,
    color: '#3E6EE8',
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
