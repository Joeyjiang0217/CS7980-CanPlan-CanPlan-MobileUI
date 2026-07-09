/** "2026-06-03" → "Jun 3, 2026". Parsed and rendered as UTC so the date never shifts. */
export function formatReportDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Today minus `days`, as an AWSDate string (YYYY-MM-DD, UTC). `0` = today. */
export function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
