import type { InfiniteData } from '@tanstack/react-query';

import type { Connection, TaskStep } from '../../shared/api/canplanTypes';
import { reorderCachedStepPages } from './reorderCachedStepPages';

function step(stepId: string, order: number): TaskStep {
  return {
    stepId,
    taskId: 'task-1',
    order,
    text: stepId,
    description: null,
    mediaAssets: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function cache(...pages: TaskStep[][]): InfiniteData<Connection<TaskStep>> {
  return {
    pages: pages.map((items, index) => ({
      items,
      nextToken: index < pages.length - 1 ? `token-${index}` : null,
    })),
    pageParams: pages.map((_, index) => (index === 0 ? undefined : `token-${index - 1}`)),
  };
}

const flatten = (data: InfiniteData<Connection<TaskStep>>) =>
  data.pages.flatMap((page) => page.items);

describe('reorderCachedStepPages', () => {
  it('renumbers the new order from 1', () => {
    const result = reorderCachedStepPages(cache([step('a', 1), step('b', 2)]), [
      step('b', 2),
      step('a', 1),
    ]);
    expect(flatten(result).map((s) => [s.stepId, s.order])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('keeps each page the size it was', () => {
    // react-query's cursors point at page boundaries, so resizing pages here
    // would desync them from the server's paging.
    const result = reorderCachedStepPages(
      cache([step('a', 1), step('b', 2)], [step('c', 3)]),
      [step('c', 3), step('b', 2), step('a', 1)],
    );
    expect(result.pages.map((page) => page.items.length)).toEqual([2, 1]);
    expect(flatten(result).map((s) => s.stepId)).toEqual(['c', 'b', 'a']);
  });

  it('preserves the page cursors and the page params', () => {
    const cached = cache([step('a', 1)], [step('b', 2)]);
    const result = reorderCachedStepPages(cached, [step('b', 2), step('a', 1)]);
    expect(result.pages.map((page) => page.nextToken)).toEqual(['token-0', null]);
    expect(result.pageParams).toEqual(cached.pageParams);
  });

  it('builds a single page when nothing is cached yet', () => {
    // Reordering straight after a cold open: one page is the honest shape.
    const result = reorderCachedStepPages(undefined, [step('a', 1), step('b', 2)]);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].nextToken).toBeNull();
    expect(result.pageParams).toEqual([undefined]);
    expect(flatten(result).map((s) => s.stepId)).toEqual(['a', 'b']);
  });

  it('does not mutate the cached data or the input steps', () => {
    const cached = cache([step('a', 1), step('b', 2)]);
    const ordered = [step('b', 2), step('a', 1)];
    reorderCachedStepPages(cached, ordered);
    expect(cached.pages[0].items.map((s) => s.stepId)).toEqual(['a', 'b']);
    expect(ordered.map((s) => s.order)).toEqual([2, 1]);
  });

  it('empties trailing pages when steps were deleted before the reorder', () => {
    // Fewer steps than the cache holds: the leftovers must not linger, or the
    // list shows steps that no longer exist.
    const result = reorderCachedStepPages(
      cache([step('a', 1), step('b', 2)], [step('c', 3), step('d', 4)]),
      [step('b', 2), step('a', 1)],
    );
    expect(result.pages.map((page) => page.items.map((s) => s.stepId))).toEqual([['b', 'a'], []]);
  });

  it('drops steps that overflow the cached page sizes', () => {
    // Documents a real limitation: the redeal only fills existing pages, so a
    // list that grew since the last fetch loses the tail until it refetches.
    const result = reorderCachedStepPages(cache([step('a', 1)]), [
      step('a', 1),
      step('b', 2),
      step('c', 3),
    ]);
    expect(flatten(result).map((s) => s.stepId)).toEqual(['a']);
  });
});
