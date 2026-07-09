import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReportDocument } from '../../features/reports/hooks/useReports';
import { formatReportDate } from '../../features/reports/lib/reportDates';
import type { MainStackParamList } from '../../navigation/types';
import BackButton from '../../shared/components/BackButton';
import PrimaryButton from '../../shared/components/PrimaryButton';
import { colors, radius, shadow, spacing, typography } from '../../shared/theme/tokens';

type ReportViewRoute = RouteProp<MainStackParamList, 'ReportView'>;
type ReportViewNavigation = NativeStackNavigationProp<MainStackParamList, 'ReportView'>;

interface ProgressRowProps {
  label: string;
  completed: number;
  total: number;
  completionRate: number;
}

/** Plain-View progress bar: label + count above a filled track. */
function ProgressRow({ label, completed, total, completionRate }: ProgressRowProps) {
  const pct = Math.round(completionRate * 100);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressLabels}>
        <Text style={styles.progressLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.progressCount}>
          {completed}/{total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countPill}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

export default function ReportViewScreen() {
  const navigation = useNavigation<ReportViewNavigation>();
  const route = useRoute<ReportViewRoute>();
  const insets = useSafeAreaInsets();
  const { userId, reportId } = route.params;

  const documentQuery = useReportDocument(userId, reportId);
  const doc = documentQuery.data;

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton variant="dark" onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Progress Report</Text>
        <View style={styles.topSpacer} />
      </View>

      {documentQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : documentQuery.isError || !doc ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load this report. Please try again.</Text>
          <PrimaryButton
            label="Retry"
            onPress={() => void documentQuery.refetch()}
            style={styles.retryBtn}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
        >
          <Text style={styles.rangeLabel}>
            {formatReportDate(doc.dateRange.from)} – {formatReportDate(doc.dateRange.to)}
          </Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.narrative}>{doc.narrative}</Text>
            <Text style={styles.basisNote}>
              Rates cover tasks that were actually attempted in this period.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Completion</Text>
            <Text style={styles.bigRate}>
              {Math.round(doc.stats.completion.completionRate * 100)}%
            </Text>
            <View style={styles.countRow}>
              <CountPill label="Completed" value={doc.stats.completion.completed} />
              <CountPill label="Skipped" value={doc.stats.completion.skipped} />
              <CountPill label="Overdue" value={doc.stats.completion.overdue} />
              <CountPill label="In progress" value={doc.stats.completion.inProgress} />
            </View>
          </View>

          {doc.stats.byCategory.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>By category</Text>
              {doc.stats.byCategory.map((row) => (
                <ProgressRow
                  key={row.categoryId}
                  label={row.categoryName}
                  completed={row.completed}
                  total={row.total}
                  completionRate={row.completionRate}
                />
              ))}
            </View>
          ) : null}

          {doc.stats.byTask.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>By task</Text>
              {doc.stats.byTask.map((row) => (
                <ProgressRow
                  key={row.taskId}
                  label={row.title}
                  completed={row.completed}
                  total={row.total}
                  completionRate={row.completionRate}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    alignSelf: 'stretch',
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  rangeLabel: {
    ...typography.bodyStrong,
    color: colors.textMuted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  narrative: {
    ...typography.body,
    color: colors.text,
  },
  basisNote: {
    ...typography.caption,
    color: colors.textMuted,
  },
  bigRate: {
    ...typography.metric,
    color: colors.primary,
  },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  countPill: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minWidth: 72,
  },
  countValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  countLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  progressRow: {
    gap: spacing.xs,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  progressLabel: {
    ...typography.body,
    color: colors.text,
    flexShrink: 1,
  },
  progressCount: {
    ...typography.body,
    color: colors.textMuted,
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
});
