"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  getDatesInRange,
  getDaysBetween,
  getTimelineDuration,
  getTimelineOffset,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/lib/timeline/date-utils";
import { useHistoryState } from "@/lib/history/use-history-state";
import {
  deleteProject,
  listProjectSummaries,
  loadCurrentProject,
  loadProjectById,
  saveProject,
  setCurrentProjectId,
  type StoredProjectSummary,
} from "@/lib/persistence/indexed-db";
import {
  DEFAULT_BAR_COLOR,
  DEFAULT_COLOR_PALETTE,
} from "@/lib/work-items/color-utils";
import {
  computeSiblingOrder,
  createWorkItem,
  getAggregateColorSegments,
  getDescendantWorkItemIds,
  getDisplayTimelines,
  getEffectiveWorkItemTimelines,
  getNextSiblingOrder,
  getWorkItemDisplayRows,
  needsRebalance,
  rebalanceSiblingOrders,
  sanitizeAutoTimelineFlags,
  type WorkItemTimeline,
} from "@/lib/work-items/tree-utils";
import type { Project, WorkItem } from "@/types/project";

const DEFAULT_DAY_WIDTH = 40;
const MIN_DAY_WIDTH = 20;
const MAX_DAY_WIDTH = 96;
const MIN_MOVE_WIDTH = 12;
const TREE_HOLD_MS = 350;
const TREE_MOVE_PX = 6;
const BAR_CLICK_MOVE_PX = 4;
const ROOT_ZONE_PX = 24;
const AUTO_UNDECIDED_MEMO = "일정 미정";

const initialWorkItems: WorkItem[] = [
  createWorkItem({
    id: "001",
    name: "디지털마케팅",
    parentId: null,
    order: 1000,
    startDate: "2026-09-01",
    endDate: "2026-09-20",
  }),
  createWorkItem({
    id: "002",
    name: "시장조사",
    parentId: "001",
    order: 1000,
    startDate: "2026-09-01",
    endDate: "2026-09-05",
  }),
  createWorkItem({
    id: "003",
    name: "기획",
    parentId: "001",
    order: 2000,
    startDate: "2026-09-04",
    endDate: "2026-09-12",
  }),
  createWorkItem({
    id: "004",
    name: "디자인",
    parentId: "001",
    order: 3000,
    startDate: "2026-09-10",
    endDate: "2026-09-20",
  }),
];

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createDefaultProject(): Project {
  const timelineStartDate = new Date();
  const timelineStart = getLocalDateString(timelineStartDate);
  const timelineEndDate = new Date(timelineStartDate);
  timelineEndDate.setDate(timelineEndDate.getDate() + 90);

  return {
    id: crypto.randomUUID(),
    name: "새 프로젝트",
    timelineStart,
    timelineEnd: getLocalDateString(timelineEndDate),
    workItems: initialWorkItems,
    customColors: [],
  };
}

function getBarBackground(
  item: WorkItem,
  timeline: WorkItemTimeline,
  workItems: WorkItem[]
): React.CSSProperties {
  if (item.isUndecided) {
    return {
      background:
        "repeating-linear-gradient(45deg, #d4d4d8, #d4d4d8 4px, #f4f4f5 4px, #f4f4f5 8px)",
    };
  }

  if (!item.autoTimeline) {
    return { backgroundColor: item.color ?? DEFAULT_BAR_COLOR };
  }

  const segments = getAggregateColorSegments(workItems, item, timeline);

  if (segments.length === 0) {
    return { backgroundColor: DEFAULT_BAR_COLOR };
  }

  const totalDays = segments.length;
  const stops = segments.flatMap((segment, index) => {
    const startPct = (index / totalDays) * 100;
    const endPct = ((index + 1) / totalDays) * 100;

    return [`${segment.color} ${startPct}%`, `${segment.color} ${endPct}%`];
  });

  return { background: `linear-gradient(to right, ${stops.join(", ")})` };
}

function getResizeHandleWidth(
  startDate: string,
  endDate: string,
  dayWidth: number
) {
  const barWidth = Math.max(
    0,
    getTimelineDuration(startDate, endDate) * dayWidth
  );

  return Math.min(
    dayWidth / 2,
    Math.max(0, (barWidth - MIN_MOVE_WIDTH) / 2)
  );
}

type DropIndicator =
  | { mode: "root" }
  | { mode: "child" | "before" | "after"; targetItemId: string };

function computeDropIndicator(
  workItems: WorkItem[],
  draggedItemId: string,
  clientX: number,
  clientY: number,
  panelRect: DOMRect | null
): DropIndicator | null {
  if (panelRect && clientX - panelRect.left < ROOT_ZONE_PX) {
    return { mode: "root" };
  }

  const target = document.elementFromPoint(clientX, clientY);
  const rowElement = target?.closest<HTMLElement>("[data-row-id]");

  if (!rowElement) return null;

  const targetItemId = rowElement.dataset.rowId as string;
  const invalidTargetIds = getDescendantWorkItemIds(workItems, draggedItemId);
  invalidTargetIds.add(draggedItemId);

  if (invalidTargetIds.has(targetItemId)) return null;

  const rect = rowElement.getBoundingClientRect();
  const ratio = (clientY - rect.top) / rect.height;

  if (ratio < 0.25) return { mode: "before", targetItemId };
  if (ratio > 0.75) return { mode: "after", targetItemId };

  return { mode: "child", targetItemId };
}

type BarDragAction = "move" | "resize-start" | "resize-end";

type BarDragOriginal = {
  itemId: string;
  startDate: string;
  endDate: string;
};

type BarDragState = {
  action: BarDragAction;
  startX: number;
  primaryItemId: string;
  originals: BarDragOriginal[];
};

/**
 * Resolves which work items move together for a bar drag/resize: when the
 * pressed bar is part of a multi-selection, every other selected,
 * date-editable bar moves with it by the same offset; otherwise just the
 * pressed bar moves alone.
 */
function getDragGroupItems(
  pressedItemId: string,
  selectedItemIds: Set<string>,
  workItems: WorkItem[]
): WorkItem[] {
  const candidateIds =
    selectedItemIds.has(pressedItemId) && selectedItemIds.size > 1
      ? selectedItemIds
      : new Set([pressedItemId]);

  return workItems.filter(
    (item) =>
      candidateIds.has(item.id) &&
      !item.autoTimeline &&
      !item.isUndecided &&
      item.startDate &&
      item.endDate
  );
}

function computeGroupDraggedDates(
  dragState: BarDragState,
  clientX: number,
  dayWidth: number,
  timelineStart: string,
  timelineEnd: string
): Map<string, { startDate: string; endDate: string }> | null {
  const deltaX = clientX - dragState.startX;
  const rawDaysMoved = Math.round(deltaX / dayWidth);

  let groupMin = -Infinity;
  let groupMax = Infinity;

  dragState.originals.forEach(({ startDate, endDate }) => {
    let itemMin: number;
    let itemMax: number;

    if (dragState.action === "resize-start") {
      itemMin = getDaysBetween(startDate, timelineStart);
      itemMax = getDaysBetween(startDate, addDays(endDate, -1));
    } else if (dragState.action === "resize-end") {
      itemMin = getDaysBetween(endDate, addDays(startDate, 1));
      itemMax = getDaysBetween(endDate, timelineEnd);
    } else {
      itemMin = getDaysBetween(startDate, timelineStart);
      itemMax = getDaysBetween(endDate, timelineEnd);
    }

    groupMin = Math.max(groupMin, itemMin);
    groupMax = Math.min(groupMax, itemMax);
  });

  if (groupMin > groupMax) {
    if (dragState.action === "move") return null;
    groupMax = groupMin;
  }

  const boundedDaysMoved = Math.min(
    groupMax,
    Math.max(groupMin, rawDaysMoved)
  );

  const updates = new Map<string, { startDate: string; endDate: string }>();

  dragState.originals.forEach(({ itemId, startDate, endDate }) => {
    if (dragState.action === "resize-start") {
      updates.set(itemId, {
        startDate: addDays(startDate, boundedDaysMoved),
        endDate,
      });
    } else if (dragState.action === "resize-end") {
      updates.set(itemId, {
        startDate,
        endDate: addDays(endDate, boundedDaysMoved),
      });
    } else {
      updates.set(itemId, {
        startDate: addDays(startDate, boundedDaysMoved),
        endDate: addDays(endDate, boundedDaysMoved),
      });
    }
  });

  return updates;
}

export default function Home() {
  const {
    state: project,
    setState: setProject,
    setStateTransient: setProjectTransient,
    commitHistory,
    resetState: resetProjectHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistoryState<Project>(createDefaultProject);
  const dragSnapshotRef = useRef<Project | null>(null);
  const colorPickerSnapshotRef = useRef<Project | null>(null);
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Project | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [isLoadingProjectList, setIsLoadingProjectList] = useState(false);
  const [projectSummaries, setProjectSummaries] = useState<
    StoredProjectSummary[]
  >([]);
  const [projectDeleteConfirmId, setProjectDeleteConfirmId] = useState<
    string | null
  >(null);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.name);
  const [isEditingTimeline, setIsEditingTimeline] = useState(false);
  const [timelineStartDraft, setTimelineStartDraft] = useState(
    project.timelineStart
  );
  const [timelineEndDraft, setTimelineEndDraft] = useState(
    project.timelineEnd
  );
  const [timelineEditError, setTimelineEditError] = useState("");
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(
    new Set()
  );
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    itemId: string;
    descendantCount: number;
  } | null>(null);

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set()
  );
  const selectedItemId =
    selectedItemIds.size === 1 ? [...selectedItemIds][0] : null;

  const selectOnly = (itemId: string) => {
    setSelectedItemIds(new Set([itemId]));
  };

  const toggleMultiSelect = (itemId: string) => {
    setSelectedItemIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(itemId)) {
        nextIds.delete(itemId);
      } else {
        nextIds.add(itemId);
      }

      return nextIds;
    });
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const barPressRef = useRef<{
    itemId: string;
    startX: number;
    startY: number;
    interactive: boolean;
    dragging: boolean;
  } | null>(null);
  const suppressBackgroundClickRef = useRef(false);

  const treePressRef = useRef<{
    itemId: string;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
    dragging: boolean;
  } | null>(null);
  const treeListRef = useRef<HTMLDivElement | null>(null);

  const [dragState, setDragState] = useState<BarDragState | null>(null);

  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);

  const [treeDragItemId, setTreeDragItemId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    loadCurrentProject()
      .then((loaded) => {
        if (cancelled) return;

        if (loaded) {
          resetProjectHistory(loaded);
          return;
        }

        // Fresh install / nothing saved yet — persist the default project
        // that useHistoryState already initialized so it becomes the
        // current project going forward.
        saveProject(project).catch(() => {});
        setCurrentProjectId(project.id).catch(() => {});
      })
      .catch(() => {
        // IndexedDB unavailable (e.g. private browsing) — keep the default project.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSaveStatus("saving");
      saveProject(project)
        .then(() => setSaveStatus("idle"))
        .catch(() => setSaveStatus("idle"));
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [project]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifierPressed = event.metaKey || event.ctrlKey;

      if (!isModifierPressed || event.key.toLowerCase() !== "z") return;

      event.preventDefault();

      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const input = customColorInputRef.current;

    if (!input || !selectedItemId) return;

    // Native "change" — fires exactly once, when the user finalizes a
    // color in the picker. This (not React's onChange, which maps to the
    // continuously-firing native "input" event) is where the final color
    // gets saved to customColors and committed as a single undo step.
    const handleChange = (event: Event) => {
      const hex = (event.target as HTMLInputElement).value;
      const snapshot = colorPickerSnapshotRef.current;

      setProjectTransient((currentProject) => ({
        ...currentProject,
        workItems: currentProject.workItems.map((item) =>
          item.id === selectedItemId ? { ...item, color: hex } : item
        ),
        customColors: currentProject.customColors.includes(hex)
          ? currentProject.customColors
          : [...currentProject.customColors, hex],
      }));

      if (snapshot) {
        commitHistory(snapshot);
        colorPickerSnapshotRef.current = null;
      }
    };

    input.addEventListener("change", handleChange);

    return () => input.removeEventListener("change", handleChange);
  }, [selectedItemId, setProjectTransient, commitHistory]);

  const workItems = project.workItems;
  const timelineDates = getDatesInRange(
    project.timelineStart,
    project.timelineEnd
  );
  const effectiveTimelines = getEffectiveWorkItemTimelines(workItems);
  const displayTimelines = getDisplayTimelines(workItems, effectiveTimelines, {
    startDate: project.timelineStart,
    endDate: project.timelineEnd,
  });
  const displayRows = getWorkItemDisplayRows(
    workItems,
    collapsedItemIds,
    displayTimelines
  );

  const selectedItem = workItems.find(
    (item) => item.id === selectedItemId
  );
  const selectedEffectiveTimeline = selectedItem
    ? effectiveTimelines.get(selectedItem.id)
    : null;
  const selectedItemHasChildren = workItems.some(
    (item) => item.parentId === selectedItemId
  );
  const deleteConfirmationItem = deleteConfirmation
    ? workItems.find((item) => item.id === deleteConfirmation.itemId)
    : null;

  const updateWorkItems = (
    updater: (currentItems: WorkItem[]) => WorkItem[]
  ) => {
    setProject((currentProject) =>
      ({
        ...currentProject,
        workItems: sanitizeAutoTimelineFlags(updater(currentProject.workItems)),
      })
    );
  };

  const updateWorkItemsTransient = (
    updater: (currentItems: WorkItem[]) => WorkItem[]
  ) => {
    setProjectTransient((currentProject) =>
      ({
        ...currentProject,
        workItems: updater(currentProject.workItems),
      })
    );
  };

  const saveProjectName = () => {
    const name = projectNameDraft.trim();

    if (!name) return;

    setProject((currentProject) => ({
      ...currentProject,
      name,
    }));
    setIsEditingProjectName(false);
  };

  const cancelProjectNameEdit = () => {
    setProjectNameDraft(project.name);
    setIsEditingProjectName(false);
  };

  const startTimelineEdit = () => {
    setTimelineStartDraft(project.timelineStart);
    setTimelineEndDraft(project.timelineEnd);
    setTimelineEditError("");
    setIsEditingTimeline(true);
  };

  const saveTimeline = () => {
    if (!timelineStartDraft || !timelineEndDraft) {
      setTimelineEditError("Timeline 시작일과 종료일을 모두 입력해주세요.");
      return;
    }

    if (timelineStartDraft > timelineEndDraft) {
      setTimelineEditError(
        "Timeline 시작일은 종료일보다 늦을 수 없습니다."
      );
      return;
    }

    setProject((currentProject) => ({
      ...currentProject,
      timelineStart: timelineStartDraft,
      timelineEnd: timelineEndDraft,
    }));
    setTimelineEditError("");
    setIsEditingTimeline(false);
  };

  const cancelTimelineEdit = () => {
    setTimelineStartDraft(project.timelineStart);
    setTimelineEndDraft(project.timelineEnd);
    setTimelineEditError("");
    setIsEditingTimeline(false);
  };

  const addWorkItem = () => {
    const parentId = selectedItemId ?? null;
    const newWorkItem = createWorkItem({
      id: crypto.randomUUID(),
      name: parentId ? "새 하위 항목" : "새 항목",
      parentId,
      order: getNextSiblingOrder(workItems, parentId),
      // Default to a 1-day bar at the timeline's start so it's always
      // visible and immediately draggable, instead of leaving the item
      // dateless (which would render no bar at all).
      startDate: project.timelineStart,
      endDate: project.timelineStart,
    });

    updateWorkItems((currentItems) => [
      ...currentItems,
      newWorkItem,
    ]);

    if (parentId) {
      setCollapsedItemIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(parentId);
        return nextIds;
      });
    }

    selectOnly(newWorkItem.id);
  };

  const updateWorkItem = (
    field: keyof WorkItem,
    value: string | null | boolean
  ) => {
    if (!selectedItemId) return;

    updateWorkItems((currentItems) =>
      currentItems.map((item) =>
        item.id === selectedItemId
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  };

  const toggleUndecided = (isUndecided: boolean) => {
    if (!selectedItemId) return;

    updateWorkItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== selectedItemId) return item;

        if (isUndecided) {
          const memo = item.memo
            ? `${item.memo} / ${AUTO_UNDECIDED_MEMO}`
            : AUTO_UNDECIDED_MEMO;

          return { ...item, isUndecided, memo, autoMemoNote: AUTO_UNDECIDED_MEMO };
        }

        if (item.autoMemoNote) {
          if (item.memo === item.autoMemoNote) {
            return { ...item, isUndecided, memo: "", autoMemoNote: null };
          }

          const suffix = ` / ${item.autoMemoNote}`;

          if (item.memo.endsWith(suffix)) {
            return {
              ...item,
              isUndecided,
              memo: item.memo.slice(0, -suffix.length),
              autoMemoNote: null,
            };
          }
        }

        return { ...item, isUndecided, autoMemoNote: null };
      })
    );
  };

  const requestDeleteWorkItem = () => {
    if (!selectedItemId) return;

    const descendantIds = getDescendantWorkItemIds(
      workItems,
      selectedItemId
    );

    setDeleteConfirmation({
      itemId: selectedItemId,
      descendantCount: descendantIds.size,
    });
  };

  const confirmDeleteWorkItem = () => {
    if (!deleteConfirmation) return;

    const deletedItemIds = getDescendantWorkItemIds(
      workItems,
      deleteConfirmation.itemId
    );
    deletedItemIds.add(deleteConfirmation.itemId);

    updateWorkItems((currentItems) =>
      currentItems.filter(
        (item) => !deletedItemIds.has(item.id)
      )
    );

    setCollapsedItemIds((currentIds) =>
      new Set(
        [...currentIds].filter((itemId) => !deletedItemIds.has(itemId))
      )
    );
    clearSelection();
    setDeleteConfirmation(null);
  };

  const toggleCollapsedItem = (itemId: string) => {
    setCollapsedItemIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(itemId)) {
        nextIds.delete(itemId);
      } else {
        nextIds.add(itemId);
      }

      return nextIds;
    });
  };

  const commitTreeDrop = (
    draggedItemId: string,
    indicator: DropIndicator
  ) => {
    let newParentId: string | null;
    let insertAfterId: string | null;

    if (indicator.mode === "root") {
      newParentId = null;
      insertAfterId = null;
    } else if (indicator.mode === "child") {
      newParentId = indicator.targetItemId;
      insertAfterId = null;
    } else {
      const targetItem = workItems.find(
        (item) => item.id === indicator.targetItemId
      );

      if (targetItem) {
        newParentId = targetItem.parentId;

        const siblings = workItems
          .filter(
            (item) =>
              item.parentId === newParentId && item.id !== draggedItemId
          )
          .sort((a, b) => a.order - b.order);
        const targetIndex = siblings.findIndex(
          (item) => item.id === targetItem.id
        );

        insertAfterId =
          indicator.mode === "after"
            ? targetItem.id
            : (siblings[targetIndex - 1]?.id ?? null);
      } else {
        newParentId = null;
        insertAfterId = null;
      }
    }

    const siblingsInOrder = workItems
      .filter(
        (item) => item.parentId === newParentId && item.id !== draggedItemId
      )
      .sort((a, b) => a.order - b.order);
    const newOrder = computeSiblingOrder(siblingsInOrder, insertAfterId);

    const insertIndex = insertAfterId
      ? siblingsInOrder.findIndex((item) => item.id === insertAfterId)
      : -1;
    const before =
      insertIndex >= 0 ? siblingsInOrder[insertIndex].order : null;
    const after =
      insertIndex >= 0
        ? (siblingsInOrder[insertIndex + 1]?.order ?? null)
        : (siblingsInOrder[0]?.order ?? null);

    updateWorkItems((currentItems) => {
      const moved = currentItems.map((item) =>
        item.id === draggedItemId
          ? { ...item, parentId: newParentId, order: newOrder }
          : item
      );

      return needsRebalance(before, newOrder, after)
        ? rebalanceSiblingOrders(moved, newParentId)
        : moved;
    });
  };

  const handleTreeRowPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem
  ) => {
    if ((event.target as HTMLElement).closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    const timer = setTimeout(() => {
      const pending = treePressRef.current;

      if (pending && pending.itemId === item.id && !pending.dragging) {
        pending.dragging = true;
        setTreeDragItemId(item.id);
        setDropIndicator(null);
      }
    }, TREE_HOLD_MS);

    treePressRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      timer,
      dragging: false,
    };
  };

  const handleTreeRowPointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const pending = treePressRef.current;

    if (!pending) return;

    if (!pending.dragging) {
      const distance = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY
      );

      if (distance <= TREE_MOVE_PX) return;

      clearTimeout(pending.timer);
      pending.dragging = true;
      setTreeDragItemId(pending.itemId);
      setDropIndicator(null);
    }

    const panelRect = treeListRef.current?.getBoundingClientRect() ?? null;
    const indicator = computeDropIndicator(
      workItems,
      pending.itemId,
      event.clientX,
      event.clientY,
      panelRect
    );

    setDropIndicator(indicator);
  };

  const handleTreeRowPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem
  ) => {
    const pending = treePressRef.current;

    treePressRef.current = null;

    if (!pending) return;

    clearTimeout(pending.timer);

    if (pending.dragging) {
      if (dropIndicator) {
        commitTreeDrop(pending.itemId, dropIndicator);
      }
    } else {
      selectOnly(item.id);
    }

    setTreeDragItemId(null);
    setDropIndicator(null);
  };

  const handleTreeRowPointerCancel = () => {
    const pending = treePressRef.current;

    treePressRef.current = null;

    if (pending) clearTimeout(pending.timer);

    setTreeDragItemId(null);
    setDropIndicator(null);
  };

  const handleExportExcel = async () => {
    setIsExporting(true);

    try {
      const { exportProjectToExcel } = await import(
        "@/lib/export/excel-export"
      );
      await exportProjectToExcel(project, collapsedItemIds);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const buffer = await file.arrayBuffer();
      const { parseExcelToProject } = await import(
        "@/lib/export/excel-import"
      );
      const imported = await parseExcelToProject(buffer);

      setPendingImport(imported);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Excel 파일을 읽는 중 오류가 발생했습니다."
      );
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Switches the app to a different project: updates in-memory state,
   * persists it under its own id, and records it as the current project —
   * so "새 프로젝트로 가져오기" leaves the previous project's record
   * untouched in storage (discoverable later via 내 프로젝트), while
   * "덮어쓰기" replaces the current project's record in place.
   */
  const switchToProject = (nextProject: Project) => {
    resetProjectHistory(nextProject);
    setCollapsedItemIds(new Set());
    clearSelection();
    saveProject(nextProject).catch(() => {});
    setCurrentProjectId(nextProject.id).catch(() => {});
  };

  const applyPendingImport = (mode: "new" | "overwrite") => {
    if (!pendingImport) return;

    const nextProject: Project =
      mode === "new"
        ? { ...pendingImport, id: crypto.randomUUID() }
        : { ...pendingImport, id: project.id };

    switchToProject(nextProject);
    setPendingImport(null);
  };

  const refreshProjectList = () => {
    setIsLoadingProjectList(true);

    listProjectSummaries()
      .then((summaries) => setProjectSummaries(summaries))
      .catch(() => setProjectSummaries([]))
      .finally(() => setIsLoadingProjectList(false));
  };

  const openProjectList = () => {
    setIsProjectListOpen(true);
    refreshProjectList();
  };

  const createNewProject = () => {
    switchToProject(createDefaultProject());
    setIsProjectListOpen(false);
  };

  const openProjectFromList = async (projectId: string) => {
    if (projectId === project.id) {
      setIsProjectListOpen(false);
      return;
    }

    const target = await loadProjectById(projectId);

    if (!target) return;

    resetProjectHistory(target);
    setCollapsedItemIds(new Set());
    clearSelection();
    setCurrentProjectId(target.id).catch(() => {});
    setIsProjectListOpen(false);
  };

  const confirmDeleteProjectFromList = async () => {
    const targetId = projectDeleteConfirmId;

    if (!targetId) return;

    await deleteProject(targetId);
    setProjectDeleteConfirmId(null);

    const remaining = await listProjectSummaries();

    setProjectSummaries(remaining);

    if (targetId === project.id) {
      if (remaining.length > 0) {
        const target = await loadProjectById(remaining[0].id);

        if (target) {
          resetProjectHistory(target);
          setCollapsedItemIds(new Set());
          clearSelection();
          setCurrentProjectId(target.id).catch(() => {});
        }
      } else {
        switchToProject(createDefaultProject());
      }
    }
  };

  const handleBarPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);

    const interactive =
      !item.autoTimeline &&
      !item.isUndecided &&
      Boolean(item.startDate) &&
      Boolean(item.endDate);

    barPressRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      interactive,
      dragging: false,
    };
  };

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem,
    action: "resize-start" | "resize-end"
  ) => {
    if (item.autoTimeline || item.isUndecided || !item.startDate || !item.endDate) return;

    event.preventDefault();
    event.stopPropagation();

    event.currentTarget.setPointerCapture(event.pointerId);
    dragSnapshotRef.current = project;

    const groupItems = getDragGroupItems(item.id, selectedItemIds, workItems);

    setDragState({
      action,
      startX: event.clientX,
      primaryItemId: item.id,
      originals: groupItems.map((groupItem) => ({
        itemId: groupItem.id,
        startDate: groupItem.startDate as string,
        endDate: groupItem.endDate as string,
      })),
    });
  };

  const applyGroupDrag = (state: BarDragState, clientX: number) => {
    const updates = computeGroupDraggedDates(
      state,
      clientX,
      dayWidth,
      project.timelineStart,
      project.timelineEnd
    );

    if (!updates) return;

    updateWorkItemsTransient((currentItems) =>
      currentItems.map((currentItem) => {
        const update = updates.get(currentItem.id);

        return update
          ? { ...currentItem, startDate: update.startDate, endDate: update.endDate }
          : currentItem;
      })
    );
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (dragState) {
      applyGroupDrag(dragState, event.clientX);
      return;
    }

    const pending = barPressRef.current;

    if (!pending || !pending.interactive) return;

    const distance = Math.hypot(
      event.clientX - pending.startX,
      event.clientY - pending.startY
    );

    if (distance <= BAR_CLICK_MOVE_PX) return;

    const groupItems = getDragGroupItems(
      pending.itemId,
      selectedItemIds,
      workItems
    );

    if (groupItems.length === 0) return;

    pending.dragging = true;
    dragSnapshotRef.current = project;

    const descriptor: BarDragState = {
      action: "move",
      startX: pending.startX,
      primaryItemId: pending.itemId,
      originals: groupItems.map((groupItem) => ({
        itemId: groupItem.id,
        startDate: groupItem.startDate as string,
        endDate: groupItem.endDate as string,
      })),
    };

    setDragState(descriptor);
    applyGroupDrag(descriptor, event.clientX);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (dragState) {
      if (dragSnapshotRef.current) {
        commitHistory(dragSnapshotRef.current);
        dragSnapshotRef.current = null;
      }

      setDragState(null);
      barPressRef.current = null;
      suppressBackgroundClickRef.current = true;
      return;
    }

    const pending = barPressRef.current;

    barPressRef.current = null;

    if (!pending) return;

    if (event.metaKey || event.ctrlKey) {
      toggleMultiSelect(pending.itemId);
    } else {
      selectOnly(pending.itemId);
    }
  };

  const handleTimelineBackgroundClick = () => {
    if (suppressBackgroundClickRef.current) {
      suppressBackgroundClickRef.current = false;
      return;
    }

    clearSelection();
  };

  const handlePointerCancel = () => {
    barPressRef.current = null;

    if (dragState) {
      dragSnapshotRef.current = null;
      setDragState(null);
    }
  };

  return (
    <main className="flex h-screen min-h-0 flex-col bg-white text-zinc-900">
      {/* Header */}
      <header className="flex min-h-20 shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-3">
        <div className="min-w-0 space-y-2">
          <h1 className="text-base font-semibold tracking-tight">
            Timeline Workspace
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-zinc-500">프로젝트명:</span>
            {isEditingProjectName ? (
              <>
                <input
                  type="text"
                  value={projectNameDraft}
                  onChange={(event) =>
                    setProjectNameDraft(event.target.value)
                  }
                  className="w-48 rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-900"
                />
                <button
                  type="button"
                  onClick={saveProjectName}
                  className="text-xs font-medium text-zinc-900"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={cancelProjectNameEdit}
                  className="text-xs text-zinc-500"
                >
                  취소
                </button>
              </>
            ) : (
              <>
                <span className="font-medium">{project.name}</span>
                <button
                  type="button"
                  onClick={() => setIsEditingProjectName(true)}
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                  aria-label="프로젝트명 편집"
                >
                  ✎
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-zinc-500">Timeline:</span>
            {isEditingTimeline ? (
              <>
                <input
                  type="date"
                  required
                  value={timelineStartDraft}
                  onChange={(event) =>
                    setTimelineStartDraft(event.target.value)
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-900"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  required
                  value={timelineEndDraft}
                  onChange={(event) =>
                    setTimelineEndDraft(event.target.value)
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-900"
                />
                <button
                  type="button"
                  onClick={saveTimeline}
                  className="text-xs font-medium text-zinc-900"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={cancelTimelineEdit}
                  className="text-xs text-zinc-500"
                >
                  취소
                </button>
                {timelineEditError && (
                  <span className="text-xs text-red-600">
                    {timelineEditError}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="font-medium">
                  {project.timelineStart} ~ {project.timelineEnd}
                </span>
                <button
                  type="button"
                  onClick={startTimelineEdit}
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                  aria-label="Timeline 기간 편집"
                >
                  ✎
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="flex h-6 items-center rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="실행 취소"
            >
              ↶ 실행취소
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="flex h-6 items-center rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="다시 실행"
            >
              ↷ 다시실행
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setDayWidth((width) =>
                  Math.max(MIN_DAY_WIDTH, width - 4)
                )
              }
              disabled={dayWidth <= MIN_DAY_WIDTH}
              className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="축소"
            >
              −
            </button>
            <span className="w-10 text-center text-xs text-zinc-500">
              {Math.round((dayWidth / DEFAULT_DAY_WIDTH) * 100)}%
            </span>
            <button
              type="button"
              onClick={() =>
                setDayWidth((width) =>
                  Math.min(MAX_DAY_WIDTH, width + 4)
                )
              }
              disabled={dayWidth >= MAX_DAY_WIDTH}
              className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="확대"
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="flex h-6 items-center rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isExporting ? "내보내는 중..." : "Excel로 내보내기"}
            </button>

            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              disabled={isImporting}
              className="flex h-6 items-center rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isImporting ? "불러오는 중..." : "Excel 불러오기"}
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={openProjectList}
              className="flex h-6 items-center gap-1 rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              내 프로젝트
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            {saveStatus === "saving" ? "저장 중..." : "저장됨"}
          </div>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Work Item Panel */}
        <section className="flex w-[320px] shrink-0 flex-col border-r border-zinc-200">
          <div className="flex h-12 items-center border-b border-zinc-200 px-4">
            <span className="text-sm font-semibold">
              Work Items
            </span>
          </div>

          <div ref={treeListRef} className="relative flex-1 overflow-auto">
            {treeDragItemId && dropIndicator?.mode === "root" && (
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] bg-blue-400/60" />
            )}

            {displayRows.map(({ item, depth, hasChildren }) => {
              const isSelected = selectedItemIds.has(item.id);
              const isCollapsed = collapsedItemIds.has(item.id);
              const isDropTarget =
                dropIndicator?.mode !== "root" &&
                dropIndicator?.mode !== undefined &&
                dropIndicator?.targetItemId === item.id;

              const dropBorderClass =
                isDropTarget && dropIndicator?.mode === "before"
                  ? "border-t-blue-400/70 border-b-zinc-100"
                  : isDropTarget && dropIndicator?.mode === "after"
                    ? "border-t-transparent border-b-blue-400/70"
                    : "border-t-transparent border-b-zinc-100";
              const backgroundClass =
                (isDropTarget && dropIndicator?.mode === "child") ||
                isSelected
                  ? "bg-zinc-100"
                  : "hover:bg-zinc-50";

              return (
                <div
                  key={item.id}
                  data-row-id={item.id}
                  onPointerDown={(event) =>
                    handleTreeRowPointerDown(event, item)
                  }
                  onPointerMove={handleTreeRowPointerMove}
                  onPointerUp={(event) => handleTreeRowPointerUp(event, item)}
                  onPointerCancel={handleTreeRowPointerCancel}
                  className={`flex h-11 w-full touch-none select-none items-center border-t border-b text-left transition-colors ${backgroundClass} ${dropBorderClass} ${
                    item.active ? "" : "opacity-40"
                  }`}
                >
                  <div
                    className="flex w-full items-center gap-2"
                    style={{
                      paddingLeft: `${16 + depth * 20}px`,
                    }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapsedItem(item.id)}
                        className="flex h-5 w-5 items-center justify-center text-xs text-zinc-500"
                        aria-label={`${item.name} ${
                          isCollapsed ? "펼치기" : "접기"
                        }`}
                      >
                        {isCollapsed ? "▶" : "▼"}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}

                    <span className="min-w-0 flex-1 truncate py-2 pr-3 text-left text-sm">
                      {item.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addWorkItem}
            className="border-t border-zinc-200 px-4 py-3 text-left text-sm text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            + 항목 추가
          </button>
        </section>

        {/* Timeline */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto">
            <div
              className="min-w-max"
              style={{ width: `${timelineDates.length * dayWidth}px` }}
              onClick={handleTimelineBackgroundClick}
            >
              <div className="flex h-12 border-b border-zinc-200">
                {timelineDates.map((date) => {
                  const saturday = isSaturday(date);
                  const sunday = isSunday(date);

                  return (
                    <div
                      key={date}
                      className={`flex shrink-0 flex-col items-center justify-center border-r border-zinc-100 px-2 text-xs ${
                        saturday || sunday ? "bg-zinc-50" : ""
                      }`}
                      style={{ width: `${dayWidth}px` }}
                    >
                      <span
                        className={
                          saturday
                            ? "text-blue-600"
                            : sunday
                              ? "text-red-600"
                              : "text-zinc-500"
                        }
                      >
                        {`${Number(date.slice(5, 7))}/${Number(
                          date.slice(8, 10)
                        )}`}
                      </span>
                      <span
                        className={
                          saturday
                            ? "text-[10px] text-blue-600"
                            : sunday
                              ? "text-[10px] text-red-600"
                              : "text-[10px] text-zinc-400"
                        }
                      >
                        {getWeekdayLabel(date)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {displayRows.map(({ item, timelineBar }) => {
                const effectiveTimeline = timelineBar?.timeline ?? null;
                const isInteractive =
                  !item.autoTimeline && !item.isUndecided;

                return (
                  <div
                    key={item.id}
                    className={`relative h-11 border-b border-zinc-100 ${
                      item.active ? "" : "opacity-40"
                    }`}
                  >
                  <div className="absolute inset-0 flex">
                    {timelineDates.map((date) => (
                      <div
                        key={date}
                        className={`shrink-0 border-r border-zinc-100 ${
                          isSaturday(date) || isSunday(date)
                            ? "bg-zinc-50"
                            : ""
                        }`}
                        style={{ width: `${dayWidth}px` }}
                      />
                    ))}
                  </div>

                  {effectiveTimeline && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) =>
                        handleBarPointerDown(event, item)
                      }
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      className={`absolute top-2 flex h-7 items-center rounded-md px-2 text-xs select-none touch-none ${
                        selectedItemIds.has(item.id)
                          ? "ring-2 ring-offset-1 ring-blue-500"
                          : ""
                      } ${
                        item.isUndecided
                          ? "cursor-default border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400"
                          : item.autoTimeline
                            ? "cursor-default text-white"
                            : dragState?.originals.some(
                                  (original) => original.itemId === item.id
                                )
                              ? "cursor-grabbing text-white"
                              : "cursor-grab text-white"
                      }`}
                      style={{
                        left: `${
                          getTimelineOffset(
                            project.timelineStart,
                            effectiveTimeline.startDate
                          ) * dayWidth
                        }px`,
                        width: `${
                          getTimelineDuration(
                            effectiveTimeline.startDate,
                            effectiveTimeline.endDate
                          ) * dayWidth
                        }px`,
                        ...getBarBackground(item, effectiveTimeline, workItems),
                      }}
                    >
                      {item.isUndecided ? "일정 미정" : null}
                      {isInteractive && (
                        <>
                          <div
                            onPointerDown={(event) =>
                              handleResizePointerDown(
                                event,
                                item,
                                "resize-start"
                              )
                            }
                            className="absolute inset-y-0 left-0 cursor-ew-resize"
                            style={{
                              width: `${getResizeHandleWidth(
                                effectiveTimeline.startDate,
                                effectiveTimeline.endDate,
                                dayWidth
                              )}px`,
                            }}
                          />
                          <div
                            onPointerDown={(event) =>
                              handleResizePointerDown(
                                event,
                                item,
                                "resize-end"
                              )
                            }
                            className="absolute inset-y-0 right-0 cursor-ew-resize"
                            style={{
                              width: `${getResizeHandleWidth(
                                effectiveTimeline.startDate,
                                effectiveTimeline.endDate,
                                dayWidth
                              )}px`,
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Detail Panel */}
        {selectedItem && (
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-zinc-200 bg-white">
            <div className="flex h-12 items-center justify-between border-b border-zinc-200 px-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  Work Item
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateWorkItem("active", !selectedItem.active)
                  }
                  aria-label={
                    selectedItem.active
                      ? "항목 비활성화"
                      : "항목 활성화"
                  }
                  aria-pressed={selectedItem.active}
                  className={`flex h-5 w-5 items-center justify-center ${
                    selectedItem.active ? "text-zinc-700" : "text-zinc-400"
                  }`}
                >
                  {selectedItem.active ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={clearSelection}
                className="text-sm text-zinc-400 hover:text-zinc-900"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto p-4">
              {/* Name */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  항목명
                </span>

                <input
                  type="text"
                  value={selectedItem.name}
                  onChange={(event) =>
                    updateWorkItem(
                      "name",
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                />
              </label>

              {/* Color */}
              <div className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  색상
                </span>

                <div className="flex flex-wrap gap-2">
                  {[...DEFAULT_COLOR_PALETTE, ...project.customColors].map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateWorkItem("color", color)}
                        aria-label={`색상 ${color} 선택`}
                        className={`h-6 w-6 rounded-full border-2 ${
                          selectedItem.color === color
                            ? "border-zinc-900"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    )
                  )}

                  <div className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-xs text-zinc-400">
                    +
                    <input
                      ref={customColorInputRef}
                      type="color"
                      value={selectedItem.color ?? DEFAULT_BAR_COLOR}
                      onPointerDown={() => {
                        colorPickerSnapshotRef.current = project;
                      }}
                      onChange={(event) => {
                        // Native "input" event (React's onChange) — fires
                        // continuously while the user drags across the
                        // picker. Preview only; never persist to
                        // customColors here, or every intermediate color
                        // the pointer passes over would get saved.
                        const hex = event.target.value;
                        const itemId = selectedItemId;

                        if (!itemId) return;

                        updateWorkItemsTransient((currentItems) =>
                          currentItems.map((item) =>
                            item.id === itemId ? { ...item, color: hex } : item
                          )
                        );
                      }}
                      aria-label="사용자 지정 색상 추가"
                      className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                    />
                  </div>
                </div>
              </div>


              {selectedItemHasChildren && (
                <label className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                  <span className="text-sm">하위 일정 자동 반영</span>
                  <input
                    type="checkbox"
                    checked={selectedItem.autoTimeline}
                    onChange={(event) =>
                      updateWorkItem("autoTimeline", event.target.checked)
                    }
                    className="h-4 w-4 accent-zinc-900"
                  />
                </label>
              )}

              <label
                className={`flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 ${
                  selectedItem.autoTimeline ? "opacity-40" : ""
                }`}
              >
                <span className="text-sm">일정 미정</span>
                <input
                  type="checkbox"
                  checked={selectedItem.isUndecided}
                  disabled={selectedItem.autoTimeline}
                  onChange={(event) =>
                    toggleUndecided(event.target.checked)
                  }
                  className="h-4 w-4 accent-zinc-900"
                />
              </label>

              {selectedItem.autoTimeline && (
                <div className="rounded-md bg-zinc-100 p-3 text-xs text-zinc-600">
                  {selectedEffectiveTimeline ? (
                    <>
                      하위 일정으로 자동 계산됨: {" "}
                      {selectedEffectiveTimeline.startDate} ~ {" "}
                      {selectedEffectiveTimeline.endDate}
                    </>
                  ) : (
                    "하위 일정이 없어 기간을 계산할 수 없습니다."
                  )}
                </div>
              )}

              {/* Start Date */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  시작일
                </span>

                <input
                  type="date"
                  value={selectedItem.startDate ?? ""}
                  onChange={(event) =>
                    updateWorkItem(
                      "startDate",
                      event.target.value || null
                    )
                  }
                  disabled={selectedItem.autoTimeline || selectedItem.isUndecided}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-100"
                />
              </label>

              {/* End Date */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  종료일
                </span>

                <input
                  type="date"
                  value={selectedItem.endDate ?? ""}
                  onChange={(event) =>
                    updateWorkItem(
                      "endDate",
                      event.target.value || null
                    )
                  }
                  disabled={selectedItem.autoTimeline || selectedItem.isUndecided}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-100"
                />
              </label>

              {/* Memo */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  메모
                </span>

                <textarea
                  value={selectedItem.memo}
                  onChange={(event) =>
                    updateWorkItem("memo", event.target.value)
                  }
                  rows={3}
                  placeholder="메모 입력"
                  className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                />
              </label>
            </div>

            <div className="border-t border-zinc-200 p-4">
              <button
                type="button"
                onClick={addWorkItem}
                className="mb-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
              >
                + 하위 항목 추가
              </button>
              <button
                type="button"
                onClick={requestDeleteWorkItem}
                className="w-full rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
              >
                항목 삭제
              </button>
            </div>
          </aside>
        )}
      </div>

      {deleteConfirmation && deleteConfirmationItem && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Work Item 삭제</h2>
            <p className="mt-2 text-sm text-zinc-600">
              {deleteConfirmationItem.name}와 하위 업무 {" "}
              {deleteConfirmation.descendantCount}개를 삭제하시겠습니까?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDeleteWorkItem}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {isProjectListOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <h2 className="text-base font-semibold">내 프로젝트</h2>
              <button
                type="button"
                onClick={() => setIsProjectListOpen(false)}
                className="text-sm text-zinc-400 hover:text-zinc-900"
              >
                ✕
              </button>
            </div>

            <div className="border-b border-zinc-200 bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-800">
              ⚠️ 이 프로젝트들은 현재 사용 중인 기기의 이 브라우저에만 저장됩니다.
              브라우저 데이터(캐시/사이트 데이터)를 삭제하면 프로젝트를 복구할 수
              없습니다.
            </div>

            <div className="flex-1 overflow-auto p-3">
              {isLoadingProjectList ? (
                <div className="p-4 text-center text-sm text-zinc-400">
                  불러오는 중...
                </div>
              ) : projectSummaries.length === 0 ? (
                <div className="p-4 text-center text-sm text-zinc-400">
                  저장된 프로젝트가 없습니다.
                </div>
              ) : (
                <ul className="space-y-1">
                  {projectSummaries.map((summary) => (
                    <li
                      key={summary.id}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 ${
                        summary.id === project.id
                          ? "bg-zinc-100"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openProjectFromList(summary.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {summary.name}
                          {summary.id === project.id ? " (현재 열림)" : ""}
                        </div>
                        <div className="truncate text-xs text-zinc-500">
                          {summary.timelineStart} ~ {summary.timelineEnd} ·
                          Work Item {summary.workItemCount}개
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectDeleteConfirmId(summary.id)}
                        className="shrink-0 text-xs text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-zinc-200 p-3">
              <button
                type="button"
                onClick={createNewProject}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                + 새 프로젝트 만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {projectDeleteConfirmId && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">프로젝트 삭제</h2>
            <p className="mt-2 text-sm text-zinc-600">
              &ldquo;
              {
                projectSummaries.find((s) => s.id === projectDeleteConfirmId)
                  ?.name
              }
              &rdquo; 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수
              없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProjectDeleteConfirmId(null)}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDeleteProjectFromList}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Excel 불러오기</h2>
            <p className="mt-2 text-sm text-zinc-600">
              &ldquo;{pendingImport.name}&rdquo; ({pendingImport.workItems.length}개
              항목)를 어떻게 불러올까요?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => applyPendingImport("new")}
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                새 프로젝트로 불러오기
                <span className="mt-0.5 block text-xs font-normal text-zinc-300">
                  현재 프로젝트는 그대로 두고, Excel 데이터를 별도의 새
                  프로젝트로 만듭니다.
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyPendingImport("overwrite")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                현재 프로젝트에 덮어쓰기
                <span className="mt-0.5 block text-xs font-normal text-zinc-400">
                  지금 열려 있는 프로젝트의 데이터를 Excel 데이터로
                  교체합니다.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="w-full rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">가져오기 실패</h2>
            <p className="mt-2 text-sm text-zinc-600">{importError}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setImportError(null)}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
