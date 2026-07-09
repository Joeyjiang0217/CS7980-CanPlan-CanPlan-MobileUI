/**
 * Tasks feature API facade.
 *
 * Schema-aligned task-template API facade. Assignments are deliberately kept
 * in their own feature: a task is a reusable template, while an assignment is
 * a user's dated snapshot of that template.
 */

import { canPlanApi } from '../../../shared/api/canplanApi';
import type {
  CreateTaskInput,
  CreateTaskStepInput,
  DeleteTaskStepInput,
  PageInput,
  ReorderTaskStepsInput,
  UpdateTaskInput,
  UpdateTaskOrderInput,
  UpdateTaskStepInput,
} from '../../../shared/api/canplanTypes';

export { canPlanApi as tasksApi };

export function getTaskById(taskId: string) {
  return canPlanApi.getTask(taskId);
}

export function listTaskSteps(taskId: string, page?: PageInput) {
  return canPlanApi.listTaskSteps(taskId, page);
}

export function listTasksByOwner(ownerId: string, page?: PageInput) {
  return canPlanApi.listTasksByOwner(ownerId, page);
}

export function listTasksByCategory(
  ownerId: string,
  categoryId: string,
  page?: PageInput,
) {
  return canPlanApi.listTasksByCategory(ownerId, categoryId, page);
}

export function listAllTasks(page?: PageInput) {
  return canPlanApi.listAllTasks(page);
}

export function createTask(input: CreateTaskInput) {
  return canPlanApi.createTask(input);
}

export function updateTask(input: UpdateTaskInput) {
  return canPlanApi.updateTask(input);
}

export function deleteTask(taskId: string) {
  return canPlanApi.deleteTask(taskId);
}

export function createTaskStep(input: CreateTaskStepInput) {
  return canPlanApi.createTaskStep(input);
}

export function updateTaskStep(input: UpdateTaskStepInput) {
  return canPlanApi.updateTaskStep(input);
}

export function deleteTaskStep(input: DeleteTaskStepInput) {
  return canPlanApi.deleteTaskStep(input);
}

export function reorderTaskSteps(input: ReorderTaskStepsInput) {
  return canPlanApi.reorderTaskSteps(input);
}

export function updateTaskOrder(input: UpdateTaskOrderInput) {
  return canPlanApi.updateTaskOrder(input);
}
