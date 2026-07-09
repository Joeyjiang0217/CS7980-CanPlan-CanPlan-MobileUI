import { useMutation } from '@tanstack/react-query';

import type { CreateAiTaskInput } from '../../../shared/api/canplanTypes';
import { createAiTask } from '../api/aiApi';

/**
 * Generates an AI task preview (clean title + ordered steps). Nothing is
 * persisted — the caller decides what to keep (CreateTaskScreen persists the
 * steps via createTaskStep), so no cache invalidation here.
 */
export function useCreateAiTask() {
  return useMutation({
    mutationFn: (input: CreateAiTaskInput) => createAiTask(input),
  });
}
