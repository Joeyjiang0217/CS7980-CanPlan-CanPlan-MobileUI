import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGenerateReport, useReports } from '../../features/reports/hooks/useReports';
import { formatReportDate, isoDaysAgo } from '../../features/reports/lib/reportDates';
import type { Report } from '../../shared/api/canplanTypes';
import type { MainStackParamList } from '../../navigation/types';
import BackButton from '../../shared/components/BackButton';
import PrimaryButton from '../../shared/components/PrimaryButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type ReportsRoute = RouteProp<MainStackParamList, 'Reports'>;
type ReportsNavigation = NativeStackNavigationProp<MainStackParamList, 'Reports'>;

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const;

export default function ReportsScreen() {
  const navigation = useNavigation<ReportsNavigation>();
  const route = useRoute<ReportsRoute>();
  const insets = useSafeAreaInsets();
  const { userId, displayName } = route.params;

  const [presetDays, setPresetDays] = useState<number>(PRESETS[0].days);

  const reportsQuery = useReports(userId);
  const generateMutation = useGenerateReport();

  const reports = reportsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const handleGenerate = () => {
    generateMutation.mutate(
      { userId, from: isoDaysAgo(presetDays - 1), to: isoDaysAgo(0) },
      {
        // generateReport only previews (persists nothing) — show the draft, then
        // the preview screen's "Save report" persists it.
        onSuccess: (draft) =>
          navigation.navigate('ReportPreview', { userId, draft }),
        onError: (error: unknown) =>
          Alert.alert(
            'Could not generate the report',
            error instanceof Error ? error.message : 'Please try again.',
          ),
      },
    );
  };

  const renderItem = ({ item }: { item: Report }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        navigation.navigate('ReportView', { userId, reportId: item.reportId })
      }
      style={({ pressed }) => [styles.reportRow, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.reportRowText}>
        <Text style={styles.reportRange}>
          {item.dateRange
            ? `${formatReportDate(item.dateRange.from)} – ${formatReportDate(item.dateRange.to)}`
            : 'Progress report'}
        </Text>
        <Text style={styles.reportCreated}>
          Generated {formatReportDate(item.createdAt.slice(0, 10))}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton variant="dark" onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.reportId}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        onEndReached={() => {
          if (reportsQuery.hasNextPage && !reportsQuery.isFetchingNextPage) {
            void reportsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.generateCard}>
            <Text style={styles.sectionTitle}>New report</Text>
            <View style={styles.chipRow}>
              {PRESETS.map((preset) => {
                const selected = preset.days === presetDays;
                return (
                  <Pressable
                    key={preset.days}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setPresetDays(preset.days)}
                    style={[styles.chip, selected ? styles.chipSelected : null]}
                  >
                    <Text
                      style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <PrimaryButton
              label="Generate report"
              onPress={handleGenerate}
              loading={generateMutation.isPending}
            />
            {generateMutation.isPending ? (
              <Text style={styles.pendingNote}>
                Generating… this can take up to a minute.
              </Text>
            ) : null}
            <Text style={styles.historyTitle}>Past reports</Text>
          </View>
        }
        ListEmptyComponent={
          reportsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.listSpinner} />
          ) : reportsQuery.isError ? (
            <Text style={styles.emptyText}>
              Could not load reports. Pull up on the list or reopen this screen to retry.
            </Text>
          ) : (
            <Text style={styles.emptyText}>
              No reports yet. Generate the first one above.
            </Text>
          )
        }
        ListFooterComponent={
          reportsQuery.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.listSpinner} />
          ) : null
        }
      />
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
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  generateCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceWarm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipLabel: {
    ...typography.body,
    color: colors.text,
  },
  chipLabelSelected: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
  },
  pendingNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  historyTitle: {
    ...typography.heading,
    color: colors.text,
    marginTop: spacing.md,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  rowPressed: {
    opacity: 0.85,
  },
  reportRowText: {
    flex: 1,
    gap: spacing.xs,
  },
  reportRange: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  reportCreated: {
    ...typography.caption,
    color: colors.textMuted,
  },
  listSpinner: {
    marginVertical: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
