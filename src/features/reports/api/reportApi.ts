/** AI progress report API facade. */

import { canPlanApi } from '../../../shared/api/canplanApi';
import type {
  GenerateReportInput,
  PageInput,
  SaveReportInput,
} from '../../../shared/api/canplanTypes';

export { canPlanApi as reportsApi };

export function generateReport(input: GenerateReportInput) {
  return canPlanApi.generateReport(input);
}

export function saveReport(input: SaveReportInput) {
  return canPlanApi.saveReport(input);
}

export function listReports(userId: string, page?: PageInput) {
  return canPlanApi.listReports(userId, page);
}

export function getReportDownloadUrl(userId: string, reportId: string) {
  return canPlanApi.getReportDownloadUrl(userId, reportId);
}

export function deleteReport(userId: string, reportId: string) {
  return canPlanApi.deleteReport(userId, reportId);
}
