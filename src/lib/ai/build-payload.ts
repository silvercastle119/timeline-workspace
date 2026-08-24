import type { Project, WorkItem } from "@/types/project";
import {
  filterOutInactiveSubtrees,
  getEffectiveWorkItemTimelines,
  getWorkItemDisplayRows,
  type WorkItemDisplayRow,
} from "@/lib/work-items/tree-utils";
import type {
  AiReviewWorkItemInput,
  AiWorkItemInput,
  FillScheduleRequestBody,
  ReviewProjectRequestBody,
} from "@/lib/ai/schemas";

const MEMO_MAX_LENGTH = 200;
export const CONDITION_NOTE_MAX_LENGTH = 300;

function trimMemo(memo: string): string {
  return memo.length > MEMO_MAX_LENGTH ? memo.slice(0, MEMO_MAX_LENGTH) : memo;
}

/**
 * Same set the Timeline actually shows (inactive subtrees excluded, matching
 * Excel export's own filtering) — both the checklist step and the request
 * payload are built from this so what the user sees is exactly what's sent.
 */
export function getVisibleWorkItems(project: Project): WorkItem[] {
  return filterOutInactiveSubtrees(project.workItems);
}

/** Ordered, indented rows for rendering the AI panel's target checklist. */
export function getScheduleChecklistRows(project: Project): WorkItemDisplayRow[] {
  return getWorkItemDisplayRows(getVisibleWorkItems(project), new Set(), new Map());
}

/**
 * Default checked state when the checklist first opens: every visible item
 * except autoTimeline ones, which can never be a target (their dates are
 * derived from children, not stored input).
 */
export function getDefaultScheduleTargetIds(project: Project): Set<string> {
  return new Set(
    getVisibleWorkItems(project)
      .filter((item) => !item.autoTimeline)
      .map((item) => item.id)
  );
}

export function buildFillScheduleRequest(
  project: Project,
  targetIds: Set<string>,
  projectConditionNote: string
): FillScheduleRequestBody {
  const workItems: AiWorkItemInput[] = getVisibleWorkItems(project).map((item) => ({
    id: item.id,
    name: item.name,
    parentId: item.parentId,
    order: item.order,
    startDate: item.startDate,
    endDate: item.endDate,
    autoTimeline: item.autoTimeline,
    isUndecided: item.isUndecided,
    memo: trimMemo(item.memo),
    targetForSuggestion: !item.autoTimeline && targetIds.has(item.id),
  }));

  return {
    timelineStart: project.timelineStart,
    timelineEnd: project.timelineEnd,
    workItems,
    projectConditionNote: projectConditionNote.trim().slice(0, CONDITION_NOTE_MAX_LENGTH),
  };
}

export function buildProjectReviewRequest(project: Project): ReviewProjectRequestBody {
  const visibleItems = getVisibleWorkItems(project);
  const effectiveTimelines = getEffectiveWorkItemTimelines(visibleItems);

  const workItems: AiReviewWorkItemInput[] = visibleItems.map((item) => {
    const effective = effectiveTimelines.get(item.id);

    return {
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      order: item.order,
      startDate: effective?.startDate ?? item.startDate,
      endDate: effective?.endDate ?? item.endDate,
      isUndecided: item.isUndecided,
      memo: trimMemo(item.memo),
    };
  });

  return {
    timelineStart: project.timelineStart,
    timelineEnd: project.timelineEnd,
    workItems,
  };
}
