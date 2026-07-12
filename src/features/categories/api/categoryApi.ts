/** Schema-aligned category API facade. */

import { canPlanApi } from '../../../shared/api/canplanApi';
import type {
  CreateCategoryInput,
  DeleteCategoryInput,
  PageInput,
  UpdateCategoryInput,
} from '../../../shared/api/canplanTypes';

export { canPlanApi as categoriesApi };

export function listMyCategories(page?: PageInput, userId?: string | null) {
  return canPlanApi.listMyCategories(page, userId);
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
