"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useHistoryState } from "@/lib/history/use-history-state";
import {
  loadCurrentProject,
  saveProject,
  setCurrentProjectId,
} from "@/lib/persistence/indexed-db";
import {
  computeSiblingOrder,
  createWorkItem,
  getDescendantWorkItemIds,
  getNextSiblingOrder,
  needsRebalance,
  rebalanceSiblingOrders,
  sanitizeAutoTimelineFlags,
} from "@/lib/work-items/tree-utils";
import { validateTimelineRange } from "@/lib/timeline/timeline-validation";
import type { Project, WorkItem } from "@/types/project";
import type { DropIndicator } from "@/components/mobile/mobile-tree-drag";

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createDefaultMobileProject(): Project {
  const timelineStartDate = new Date();
  const timelineStart = getLocalDateString(timelineStartDate);
  const timelineEndDate = new Date(timelineStartDate);
  timelineEndDate.setDate(timelineEndDate.getDate() + 90);

  return {
    id: crypto.randomUUID(),
    name: "새 프로젝트",
    timelineStart,
    timelineEnd: getLocalDateString(timelineEndDate),
    workItems: [],
    customColors: [],
  };
}

type ProjectSettingsResult = { valid: true } | { valid: false; reason: string };

type MobileProjectContextValue = {
  project: Project;
  isLoaded: boolean;
  updateWorkItems: (updater: (items: WorkItem[]) => WorkItem[]) => void;
  commitScheduleEdit: (itemId: string, updatedItem: WorkItem) => void;
  addWorkItem: (parentId: string | null) => string;
  deleteWorkItem: (itemId: string) => void;
  moveWorkItem: (draggedItemId: string, indicator: DropIndicator) => void;
  updateProjectSettings: (
    name: string,
    timelineStart: string,
    timelineEnd: string
  ) => ProjectSettingsResult;
  switchToProject: (nextProject: Project) => void;
  collapsedItemIds: Set<string>;
  toggleCollapsedItem: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const MobileProjectContext = createContext<MobileProjectContextValue | null>(
  null
);

export function MobileProjectProvider({ children }: { children: ReactNode }) {
  const {
    state: project,
    setState: setProject,
    resetState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistoryState<Project>(createDefaultMobileProject);
  const [isLoaded, setIsLoaded] = useState(false);
  // 목록(/m)과 Timeline(/m/timeline)이 같은 (tabs)/layout.tsx 아래에서
  // 유지되므로, 여기 두면 두 화면이 자연히 같은 펼침/접힘 상태를 공유한다.
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(
    () => new Set()
  );

  // 초기 로드: PC(page.tsx 1083~1112행)와 동일한 규칙.
  useEffect(() => {
    let cancelled = false;

    loadCurrentProject().then((loaded) => {
      if (cancelled) return;

      if (loaded) {
        resetState(loaded);
      } else {
        const defaultProject = createDefaultMobileProject();

        resetState(defaultProject);
        saveProject(defaultProject).catch(() => {});
        setCurrentProjectId(defaultProject.id).catch(() => {});
      }

      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장: PC(page.tsx 1114~1123행)와 동일한 800ms debounce 규칙.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveProject(project).catch(() => {});
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [project]);

  const updateWorkItems = useCallback(
    (updater: (items: WorkItem[]) => WorkItem[]) => {
      setProject((current) => ({
        ...current,
        workItems: sanitizeAutoTimelineFlags(updater(current.workItems)),
      }));
    },
    [setProject]
  );

  // 일정 상세 화면의 "저장" 시점에 draft 전체를 한 번에 커밋한다.
  const commitScheduleEdit = useCallback(
    (itemId: string, updatedItem: WorkItem) => {
      updateWorkItems((items) =>
        items.map((item) => (item.id === itemId ? updatedItem : item))
      );
    },
    [updateWorkItems]
  );

  // PC addWorkItem(page.tsx:1370)과 동일한 규칙: 부모 자식 목록 뒤에 추가.
  const addWorkItem = useCallback(
    (parentId: string | null) => {
      const id = crypto.randomUUID();

      updateWorkItems((items) => {
        const order = getNextSiblingOrder(items, parentId);
        const newItem = createWorkItem({ id, name: "새 업무", parentId, order });

        return [...items, newItem];
      });

      return id;
    },
    [updateWorkItems]
  );

  // PC confirmDeleteWorkItem(page.tsx:1651)과 동일: 본인+모든 하위 항목 삭제.
  const deleteWorkItem = useCallback(
    (itemId: string) => {
      updateWorkItems((items) => {
        const descendantIds = getDescendantWorkItemIds(items, itemId);

        return items.filter((item) => item.id !== itemId && !descendantIds.has(item.id));
      });
    },
    [updateWorkItems]
  );

  // PC commitTreeDrop(page.tsx:1690~1761)과 동일한 순서/부모 갱신 규칙.
  const moveWorkItem = useCallback(
    (draggedItemId: string, indicator: DropIndicator) => {
      updateWorkItems((items) => {
        let newParentId: string | null;
        let insertAfterId: string | null;

        if (indicator.mode === "root") {
          newParentId = null;
          insertAfterId = null;
        } else if (indicator.mode === "child") {
          newParentId = indicator.targetItemId;
          insertAfterId = null;
        } else {
          const targetItem = items.find((item) => item.id === indicator.targetItemId);

          if (targetItem) {
            newParentId = targetItem.parentId;

            const siblings = items
              .filter((item) => item.parentId === newParentId && item.id !== draggedItemId)
              .sort((a, b) => a.order - b.order);
            const targetIndex = siblings.findIndex((item) => item.id === targetItem.id);

            insertAfterId =
              indicator.mode === "after"
                ? targetItem.id
                : (siblings[targetIndex - 1]?.id ?? null);
          } else {
            newParentId = null;
            insertAfterId = null;
          }
        }

        const siblingsInOrder = items
          .filter((item) => item.parentId === newParentId && item.id !== draggedItemId)
          .sort((a, b) => a.order - b.order);
        const newOrder = computeSiblingOrder(siblingsInOrder, insertAfterId);

        const insertIndex = insertAfterId
          ? siblingsInOrder.findIndex((item) => item.id === insertAfterId)
          : -1;
        const before = insertIndex >= 0 ? siblingsInOrder[insertIndex].order : null;
        const after =
          insertIndex >= 0
            ? (siblingsInOrder[insertIndex + 1]?.order ?? null)
            : (siblingsInOrder[0]?.order ?? null);

        const moved = items.map((item) =>
          item.id === draggedItemId
            ? { ...item, parentId: newParentId, order: newOrder }
            : item
        );

        return needsRebalance(before, newOrder, after)
          ? rebalanceSiblingOrders(moved, newParentId)
          : moved;
      });
    },
    [updateWorkItems]
  );

  // PC saveProjectName/saveTimeline(page.tsx:1314, 1338)과 동일한 검증 규칙.
  const updateProjectSettings = useCallback(
    (name: string, timelineStart: string, timelineEnd: string): ProjectSettingsResult => {
      const rangeCheck = validateTimelineRange(timelineStart, timelineEnd);

      if (!rangeCheck.valid) return rangeCheck;

      setProject((current) => ({ ...current, name, timelineStart, timelineEnd }));

      return { valid: true };
    },
    [setProject]
  );

  // PC switchToProject(page.tsx:1925~1939)와 동일: 프로젝트 전체를
  // 교체하는 작업(Excel 덮어쓰기, 다른 프로젝트로 전환 등)이라 undo
  // 히스토리를 리셋하고, debounce를 기다리지 않고 즉시 저장하며,
  // collapsed 상태도 초기화한다(PC의 setCollapsedItemIds(new Set())와 동일).
  const switchToProject = useCallback(
    (nextProject: Project) => {
      resetState(nextProject);
      setCollapsedItemIds(new Set());
      saveProject(nextProject).catch(() => {});
      setCurrentProjectId(nextProject.id).catch(() => {});
    },
    [resetState]
  );

  const toggleCollapsedItem = useCallback((id: string) => {
    setCollapsedItemIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const value: MobileProjectContextValue = {
    project,
    isLoaded,
    updateWorkItems,
    commitScheduleEdit,
    addWorkItem,
    deleteWorkItem,
    moveWorkItem,
    updateProjectSettings,
    switchToProject,
    collapsedItemIds,
    toggleCollapsedItem,
    undo,
    redo,
    canUndo,
    canRedo,
  };

  return (
    <MobileProjectContext.Provider value={value}>
      {children}
    </MobileProjectContext.Provider>
  );
}

export function useMobileProject() {
  const context = useContext(MobileProjectContext);

  if (!context) {
    throw new Error("useMobileProject must be used within MobileProjectProvider");
  }

  return context;
}
