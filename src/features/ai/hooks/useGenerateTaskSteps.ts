import { useMutation } from '@tanstack/react-query';

import type {
  CreateAiTaskInput,
  GenerateTaskStepsInput,
} from '../../../shared/api/canplanTypes';
import { createAiTask, generateTaskSteps } from '../api/aiApi';

/** Generates source-cited draft steps; callers decide whether to persist them in a task. */
export function useGenerateTaskSteps() {
  return useMutation({
    mutationFn: (input: GenerateTaskStepsInput) => generateTaskSteps(input),
  });
}

/** Generates a titled task preview; callers decide whether to save it. */
export function useCreateAiTask() {
  return useMutation({
    mutationFn: (input: CreateAiTaskInput) => createAiTask(input),
  });
}
