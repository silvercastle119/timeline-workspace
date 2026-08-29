import { getDatesInRange } from "@/lib/timeline/date-utils";
import { DEFAULT_BAR_COLOR, blendColors } from "@/lib/work-items/color-utils";
import type { Checkpoint, WorkItem } from "@/types/project";

export type WorkItemTimeline = {
  startDate: string;
  endDate: string;
};

export type WorkItemTimelineBar = {
  kind: "task" | "project";
  timeline: WorkItemTimeline;
};

export type WorkItemDisplayRow = {
  item: WorkItem;
  depth: number;
  hasChildren: boolean;
  timelineBar: WorkItemTimelineBar | null;
};

export const DEFAULT_ORDER_STEP = 1000;

function hasValidDates(item: WorkItem): item is WorkItem & WorkItemTimeline {
  return Boolean(
    item.startDate && item.endDate && item.startDate <= item.endDate
  );
}

function getChildrenByParentId(workItems: WorkItem[]) {
  const childrenByParentId = new Map<string | null, WorkItem[]>();

  workItems.forEach((item) => {
    const siblings = childrenByParentId.get(item.parentId) ?? [];
    childrenByParentId.set(item.parentId, [...siblings, item]);
  });

  childrenByParentId.forEach((siblings, parentId) => {
    childrenByParentId.set(
      parentId,
      [...siblings].sort((a, b) => a.order - b.order)
    );
  });

  return childrenByParentId;
}

export function createWorkItem(input: {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  startDate?: string | null;
  endDate?: string | null;
  autoTimeline?: boolean;
}): WorkItem {
  return {
    id: input.id,
    name: input.name,
    parentId: input.parentId,
    order: input.order,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    autoTimeline: input.autoTimeline ?? false,
    isUndecided: false,
    active: true,
    color: null,
    memo: "",
    autoMemoNote: null,
    checkpoints: [],
    assignee: "",
    status: "planned",
    priority: "medium",
  };
}

export function getNextSiblingOrder(
  workItems: WorkItem[],
  parentId: string | null
) {
  const siblingOrders = workItems
    .filter((item) => item.parentId === parentId)
    .map((item) => item.order);

  if (siblingOrders.length === 0) return DEFAULT_ORDER_STEP;

  return Math.max(...siblingOrders) + DEFAULT_ORDER_STEP;
}

const ORDER_EPSILON = 1e-6;

export function computeSiblingOrder(
  siblingsInOrder: WorkItem[],
  insertAfterId: string | null
): number {
  const index = insertAfterId
    ? siblingsInOrder.findIndex((item) => item.id === insertAfterId)
    : -1;

  const before = index >= 0 ? siblingsInOrder[index].order : null;
  const after =
    index >= 0
      ? (siblingsInOrder[index + 1]?.order ?? null)
      : (siblingsInOrder[0]?.order ?? null);

  if (before === null && after === null) return DEFAULT_ORDER_STEP;
  if (before === null) return after! - DEFAULT_ORDER_STEP;
  if (after === null) return before + DEFAULT_ORDER_STEP;

  return (before + after) / 2;
}

export function needsRebalance(
  before: number | null,
  mid: number,
  after: number | null
) {
  if (before !== null && Math.abs(mid - before) < ORDER_EPSILON) return true;
  if (after !== null && Math.abs(after - mid) < ORDER_EPSILON) return true;

  return false;
}

export function rebalanceSiblingOrders(
  workItems: WorkItem[],
  parentId: string | null
): WorkItem[] {
  const siblings = workItems
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.order - b.order);

  const orderById = new Map(
    siblings.map((item, index) => [item.id, (index + 1) * DEFAULT_ORDER_STEP])
  );

  return workItems.map((item) =>
    orderById.has(item.id)
      ? { ...item, order: orderById.get(item.id)! }
      : item
  );
}

export function normalizeWorkItem(
  raw: Partial<WorkItem> & { id: string }
): WorkItem {
  return {
    id: raw.id,
    name: raw.name ?? "",
    parentId: raw.parentId ?? null,
    order: raw.order ?? 0,
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
    autoTimeline: raw.autoTimeline ?? false,
    isUndecided: raw.isUndecided ?? false,
    active: raw.active ?? true,
    color: raw.color ?? null,
    memo: raw.memo ?? "",
    autoMemoNote: raw.autoMemoNote ?? null,
    checkpoints: Array.isArray(raw.checkpoints) ? raw.checkpoints : [],
    assignee: raw.assignee ?? "",
    status: raw.status ?? "planned",
    priority: raw.priority ?? "medium",
  };
}

export function getWorkItemDisplayRows(
  workItems: WorkItem[],
  collapsedItemIds: Set<string>,
  timelines: Map<string, WorkItemTimeline | null>
) {
  const childrenByParentId = getChildrenByParentId(workItems);
  const itemIds = new Set(workItems.map((item) => item.id));
  // getChildrenByParentId already sorts every parentId group (including the
  // implicit root group) by `order` — but roots is re-derived here via a
  // fresh filter over workItems, which only preserves raw array insertion
  // order. Without this sort, changing a root item's `order` (e.g. via
  // drag-and-drop reordering) never affects where it renders, even though
  // non-root siblings reorder correctly through the sorted map above.
  const roots = workItems
    .filter((item) => item.parentId === null || !itemIds.has(item.parentId))
    .sort((a, b) => a.order - b.order);
  const rows: WorkItemDisplayRow[] = [];
  const visited = new Set<string>();

  const appendRow = (item: WorkItem, depth: number) => {
    if (visited.has(item.id)) return;

    visited.add(item.id);

    const children = childrenByParentId.get(item.id) ?? [];
    const hasChildren = children.length > 0;
    const ownTimeline = timelines.get(item.id) ?? null;

    rows.push({
      item,
      depth,
      hasChildren,
      timelineBar: ownTimeline
        ? { kind: hasChildren ? "project" : "task", timeline: ownTimeline }
        : null,
    });

    if (collapsedItemIds.has(item.id)) return;

    children.forEach((child) => appendRow(child, depth + 1));
  };

  roots.forEach((item) => appendRow(item, 0));

  return rows;
}

/**
 * Turns off autoTimeline for any item that no longer has children (e.g.
 * after a delete or a tree drag moved its last child elsewhere). Leaf
 * items must not be stuck with an unreachable "하위 일정 자동 반영" state
 * since the toggle UI is hidden for them.
 */
export function sanitizeAutoTimelineFlags(workItems: WorkItem[]): WorkItem[] {
  const parentIds = new Set(workItems.map((item) => item.parentId));

  return workItems.map((item) =>
    item.autoTimeline && !parentIds.has(item.id)
      ? { ...item, autoTimeline: false }
      : item
  );
}

export function isDateWithinRange(
  date: string,
  startDate: string,
  endDate: string
): boolean {
  return date >= startDate && date <= endDate;
}

/**
 * Drops any checkpoint whose date no longer falls within the item's own
 * [startDate, endDate] — called whenever those dates shrink (a direct edit
 * or a resize-drag commit), never on a pure move (which preserves duration).
 */
export function clampCheckpointsToRange(
  checkpoints: Checkpoint[],
  startDate: string | null,
  endDate: string | null
): Checkpoint[] {
  if (!startDate || !endDate) return [];

  return checkpoints.filter((checkpoint) =>
    isDateWithinRange(checkpoint.date, startDate, endDate)
  );
}

export function getDescendantWorkItemIds(
  workItems: WorkItem[],
  parentId: string
) {
  const childrenByParentId = getChildrenByParentId(workItems);
  const descendantIds = new Set<string>();

  const collect = (currentParentId: string) => {
    const children = childrenByParentId.get(currentParentId) ?? [];

    children.forEach((child) => {
      if (descendantIds.has(child.id)) return;

      descendantIds.add(child.id);
      collect(child.id);
    });
  };

  collect(parentId);

  return descendantIds;
}

export function getEffectiveWorkItemTimelines(workItems: WorkItem[]) {
  const childrenByParentId = getChildrenByParentId(workItems);
  const timelines = new Map<string, WorkItemTimeline | null>();

  const getTimeline = (
    item: WorkItem,
    lineage: Set<string>
  ): WorkItemTimeline | null => {
    if (lineage.has(item.id)) return null;

    if (!item.autoTimeline) {
      return hasValidDates(item)
        ? { startDate: item.startDate, endDate: item.endDate }
        : null;
    }

    const nextLineage = new Set(lineage);
    nextLineage.add(item.id);
    const descendantTimelines: WorkItemTimeline[] = [];

    const collectDescendants = (parentId: string, path: Set<string>) => {
      const children = childrenByParentId.get(parentId) ?? [];

      children.forEach((child) => {
        if (path.has(child.id)) return;
        if (!child.active) return;

        const childTimeline = getTimeline(child, path);

        if (childTimeline) {
          descendantTimelines.push(childTimeline);
        }

        const nextPath = new Set(path);
        nextPath.add(child.id);
        collectDescendants(child.id, nextPath);
      });
    };

    collectDescendants(item.id, nextLineage);

    if (descendantTimelines.length === 0) return null;

    return descendantTimelines.reduce(
      (range, timeline) => ({
        startDate:
          timeline.startDate < range.startDate
            ? timeline.startDate
            : range.startDate,
        endDate:
          timeline.endDate > range.endDate
            ? timeline.endDate
            : range.endDate,
      }),
      descendantTimelines[0]
    );
  };

  workItems.forEach((item) => {
    timelines.set(item.id, getTimeline(item, new Set()));
  });

  return timelines;
}

export type ColorSegment = {
  date: string;
  color: string;
};

export type NamedColorSegment = {
  date: string;
  color: string;
  /** Names of every active leaf contributor on this date, in the order
   * they were encountered (earliest-starting first, per tree traversal
   * order — matches the reading order used for the "/"-joined label). */
  names: string[];
};

type ColorContribution = {
  startDate: string;
  endDate: string;
  color: string;
  name: string;
};

/**
 * Recursively collects the leaf date/color/name contributions feeding an
 * auto-aggregated item's timeline. Shared by `getAggregateColorSegments`
 * (Web — color only) and `getAggregateNamedColorSegments` (Excel — color
 * + contributing names), so both surfaces are guaranteed to compute the
 * exact same per-date breakdown from the exact same data.
 */
function collectColorContributions(
  childrenByParentId: Map<string | null, WorkItem[]>,
  item: WorkItem,
  lineage: Set<string>
): ColorContribution[] {
  if (lineage.has(item.id)) return [];

  if (!item.autoTimeline) {
    return hasValidDates(item)
      ? [
          {
            startDate: item.startDate,
            endDate: item.endDate,
            color: item.color ?? DEFAULT_BAR_COLOR,
            name: item.name,
          },
        ]
      : [];
  }

  const nextLineage = new Set(lineage);
  nextLineage.add(item.id);
  const children = childrenByParentId.get(item.id) ?? [];
  const contributions: ColorContribution[] = [];

  children.forEach((child) => {
    if (nextLineage.has(child.id)) return;
    if (!child.active) return;

    contributions.push(
      ...collectColorContributions(childrenByParentId, child, nextLineage)
    );
  });

  return contributions;
}

export function getAggregateColorSegments(
  workItems: WorkItem[],
  aggregateItem: WorkItem,
  aggregateTimeline: WorkItemTimeline
): ColorSegment[] {
  const childrenByParentId = getChildrenByParentId(workItems);
  const contributions = collectColorContributions(
    childrenByParentId,
    aggregateItem,
    new Set()
  );

  return getDatesInRange(
    aggregateTimeline.startDate,
    aggregateTimeline.endDate
  ).map((date) => {
    const activeColors = contributions
      .filter(
        (contribution) =>
          date >= contribution.startDate && date <= contribution.endDate
      )
      .map((contribution) => contribution.color);

    return {
      date,
      color:
        activeColors.length > 0
          ? blendColors(activeColors)
          : DEFAULT_BAR_COLOR,
    };
  });
}

/**
 * Same per-date breakdown as `getAggregateColorSegments`, but also
 * reports which leaf work items are active on each date — so a
 * presentation layer (currently: Excel export) can split an
 * auto-aggregated bar into segments per actual child date-range instead
 * of just per same-color run, and label overlapping segments as
 * "childA / childB".
 */
export function getAggregateNamedColorSegments(
  workItems: WorkItem[],
  aggregateItem: WorkItem,
  aggregateTimeline: WorkItemTimeline
): NamedColorSegment[] {
  const childrenByParentId = getChildrenByParentId(workItems);
  const contributions = collectColorContributions(
    childrenByParentId,
    aggregateItem,
    new Set()
  );

  return getDatesInRange(
    aggregateTimeline.startDate,
    aggregateTimeline.endDate
  ).map((date) => {
    const active = contributions.filter(
      (contribution) =>
        date >= contribution.startDate && date <= contribution.endDate
    );

    return {
      date,
      color:
        active.length > 0
          ? blendColors(active.map((contribution) => contribution.color))
          : DEFAULT_BAR_COLOR,
      names: active.map((contribution) => contribution.name),
    };
  });
}

/**
 * Web display timelines: applies the isUndecided full-range override only.
 * Active=false items intentionally keep their real timeline here — they
 * must still render (faded) in the web Timeline. Excel export handles the
 * active exclusion separately via `filterOutInactiveSubtrees`, since being
 * excluded from calculation/Excel is a different concept from being hidden
 * on the web.
 */
export function getDisplayTimelines(
  workItems: WorkItem[],
  effectiveTimelines: Map<string, WorkItemTimeline | null>,
  projectRange: WorkItemTimeline
): Map<string, WorkItemTimeline | null> {
  const displayTimelines = new Map(effectiveTimelines);

  workItems.forEach((item) => {
    if (!item.isUndecided || item.autoTimeline) return;

    displayTimelines.set(item.id, projectRange);
  });

  return displayTimelines;
}

/**
 * Ids of every item that is inactive itself, or has an inactive ancestor
 * somewhere above it — i.e. every item that `filterOutInactiveSubtrees`
 * would drop from Excel. A child's own `active` flag is untouched either
 * way; this only reports the *effective* (inherited) inactive state so
 * the web Timeline can render it faded to match what Excel will actually
 * show, without changing the underlying data.
 */
export function getInactiveSubtreeIds(workItems: WorkItem[]): Set<string> {
  const itemsById = new Map(workItems.map((item) => [item.id, item]));
  const excludedIds = new Set<string>();

  const isExcluded = (item: WorkItem, visiting: Set<string>): boolean => {
    if (excludedIds.has(item.id)) return true;
    // Guards against a circular parentId chain (e.g. imported data where
    // A's parent is B and B's parent is A) walking upward forever.
    if (visiting.has(item.id)) return false;

    if (!item.active) {
      excludedIds.add(item.id);
      return true;
    }

    if (item.parentId !== null) {
      const parent = itemsById.get(item.parentId);

      if (parent) {
        visiting.add(item.id);
        const parentExcluded = isExcluded(parent, visiting);
        visiting.delete(item.id);

        if (parentExcluded) {
          excludedIds.add(item.id);
          return true;
        }
      }
    }

    return false;
  };

  workItems.forEach((item) => isExcluded(item, new Set()));

  return excludedIds;
}

/**
 * Removes items with active=false along with their entire descendant
 * subtree. Used for Excel export, where inactive work items must not
 * appear at all (unlike the web Timeline, where they still render faded).
 */
export function filterOutInactiveSubtrees(workItems: WorkItem[]): WorkItem[] {
  const excludedIds = getInactiveSubtreeIds(workItems);

  return workItems.filter((item) => !excludedIds.has(item.id));
}
