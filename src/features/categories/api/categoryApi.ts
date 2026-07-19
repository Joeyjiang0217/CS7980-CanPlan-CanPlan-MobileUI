/** Schema-aligned category API facade. */

import { canPlanApi } from '../../../shared/api/canplanApi';
import type {
  CreateCategoryInput,
  DeleteCategoryInput,
  PageInput,
  UpdateCategoryInput,
} from '../../../shared/api/canplanTypes';

export { canPlanApi as categoriesApi };

/** `userId` reads a delegated primary user's categories; omit for the caller's own. */
export function listMyCategories(userId?: string, page?: PageInput) {
  return canPlanApi.listMyCategories(userId, page);
}

export function createCategory(input: CreateCategoryInput) {
  return canPlanApi.createCategory(input);
}

export function updateCategory(input: UpdateCategoryInput) {
  return canPlanApi.updateCategory(input);
}

export function deleteCategory(input: DeleteCategoryInput) {
  return canPlanApi.deleteCategory(input);
}
