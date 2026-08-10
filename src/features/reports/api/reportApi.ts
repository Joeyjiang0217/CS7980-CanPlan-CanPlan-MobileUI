import { canPlanApi } from '../../../shared/api/canplanApi';
import { GraphQLRequestError } from '../../../shared/api/errors';
import type {
  GenerateReportInput,
  GeneratedReport,
  PageInput,
  Report,
  ReportDocument,
  SaveReportInput,
} from '../../../shared/api/canplanTypes';

export function listReports(userId: string, page?: PageInput) {
  return canPlanApi.listReports(userId, page);
}

/** Generate a non-persisting preview (AI narrative + stats + a save token). */
export function generateReport(input: GenerateReportInput): Promise<GeneratedReport> {
  return canPlanApi.generateReport(input);
}

/** Persist a previously generated draft; returns the saved Report. */
export function saveReport(input: SaveReportInput): Promise<Report> {
  return canPlanApi.saveReport(input);
}

/** Mints a fresh presigned URL, then downloads the full report JSON from S3. */
export async function fetchReportDocument(
  userId: string,
  reportId: string,
): Promise<ReportDocument> {
  const target = await canPlanApi.getReportDownloadUrl(userId, reportId);
  const response = await fetch(target.downloadUrl);
  if (!response.ok) {
    throw new GraphQLRequestError(
      `Report download failed (HTTP ${response.status}).`,
      { statusCode: response.status },
    );
  }
  return (await response.json()) as ReportDocument;
}
