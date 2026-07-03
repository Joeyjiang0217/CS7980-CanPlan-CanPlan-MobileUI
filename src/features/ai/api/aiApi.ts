/** AI task-step generation API facade. */

import { canPlanApi } from '../../../shared/api/canplanApi';
import type { CreateAiTaskInput, GenerateTaskStepsInput } from '../../../shared/api/canplanTypes';

export { canPlanApi as aiApi };

export function generateTaskSteps(input: GenerateTaskStepsInput) {
  return canPlanApi.generateTaskSteps(input);
}

export function createAiTask(input: CreateAiTaskInput) {
  return canPlanApi.createAiTask(input);
}
