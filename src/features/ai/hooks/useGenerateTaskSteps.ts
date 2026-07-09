import { useMutation } from '@tanstack/react-query';

import type { GenerateTaskStepsInput } from '../../../shared/api/canplanTypes';
import { generateTaskSteps } from '../api/aiApi';

/** Generates source-cited draft steps; callers decide whether to persist them in a task. */
export function useGenerateTaskSteps() {
  return useMutation({
    mutationFn: (input: GenerateTaskStepsInput) => generateTaskSteps(input),
  });
}
