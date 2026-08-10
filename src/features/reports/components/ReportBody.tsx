import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ReportDateRange, ReportStats } from '../../../shared/api/canplanTypes';
import { colors, radius, shadow, spacing, typography } from '../../../shared/theme/tokens';
import { formatReportDate } from '../lib/reportDates';

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

interface ReportBodyProps {
  narrative: string;
  stats: ReportStats;
  dateRange: ReportDateRange;
  /** Bottom padding for the scroll content (safe-area aware). */
  contentPaddingBottom: number;
  /** Optional footer rendered below the cards (e.g. a Save button in preview). */
  footer?: ReactNode;
}

/**
 * Read-only rendering of a report's narrative + stats, shared by the saved
 * report view and the unsaved preview so both look identical.
 */
export default function ReportBody({
  narrative,
  stats,
  dateRange,
  contentPaddingBottom,
  footer,
}: ReportBodyProps) {
  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: contentPaddingBottom }]}
    >
      <Text style={styles.rangeLabel}>
        {formatReportDate(dateRange.from)} – {formatReportDate(dateRange.to)}
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.narrative}>{narrative}</Text>
        <Text style={styles.basisNote}>
          Rates cover tasks that were actually attempted in this period.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Completion</Text>
        <Text style={styles.bigRate}>
          {Math.round(stats.completion.completionRate * 100)}%
        </Text>
        <View style={styles.countRow}>
          <CountPill label="Completed" value={stats.completion.completed} />
          <CountPill label="Skipped" value={stats.completion.skipped} />
          <CountPill label="Overdue" value={stats.completion.overdue} />
          <CountPill label="In progress" value={stats.completion.inProgress} />
        </View>
      </View>

      {stats.byCategory.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>By category</Text>
          {stats.byCategory.map((row) => (
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

      {stats.byTask.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>By task</Text>
          {stats.byTask.map((row) => (
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

      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
