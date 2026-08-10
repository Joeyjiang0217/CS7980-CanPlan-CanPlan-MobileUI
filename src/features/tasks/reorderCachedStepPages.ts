/**
 * Rewrite a cached step list into a new order, optimistically.
 *
 * Extracted from ReorderStepsScreen so the paging arithmetic can be tested: it
 * runs inside `setQueryData` while a drag settles, and getting the page split
 * wrong drops or duplicates steps in the cache — which the user sees as steps
 * vanishing until the next fetch.
 *
 * Steps are renumbered 1..N (the backend's own convention) and redealt across
 * the existing pages, keeping each page's size so react-query's cursors stay
 * meaningful.
 */
import type { InfiniteData } from '@tanstack/react-query';

import type { Connection, TaskStep } from '../../shared/api/canplanTypes';

export function reorderCachedStepPages(
  cached: InfiniteData<Connection<TaskStep>> | undefined,
  orderedSteps: TaskStep[],
): InfiniteData<Connection<TaskStep>> {
  const reorderedSteps = orderedSteps.map((step, index) => ({
    ...step,
    order: index + 1,
  }));

  // Nothing cached yet (a reorder straight after a cold open): one page is a
  // truthful shape for the list we now know.
  if (!cached) {
    return {
      pages: [{ items: reorderedSteps, nextToken: null }],
      pageParams: [undefined],
    };
  }

  let cursor = 0;
  return {
    ...cached,
    pages: cached.pages.map((page) => {
      const pageSize = page.items.length;
      const items = reorderedSteps.slice(cursor, cursor + pageSize);
      cursor += pageSize;
      return { ...page, items };
    }),
  };
}
