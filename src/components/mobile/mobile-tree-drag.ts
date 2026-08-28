import { getDescendantWorkItemIds } from "@/lib/work-items/tree-utils";
import type { WorkItem } from "@/types/project";

export const ROOT_ZONE_PX = 24;

export type DropIndicator =
  | { mode: "root" }
  | { mode: "child" | "before" | "after"; targetItemId: string };

// PC의 computeDropIndicator(page.tsx, export되지 않은 로컬 함수)와 동일한 규칙.
export function computeMobileDropIndicator(
  workItems: WorkItem[],
  draggedItemId: string,
  clientX: number,
  clientY: number,
  containerRect: DOMRect | null
): DropIndicator | null {
  if (containerRect && clientX - containerRect.left < ROOT_ZONE_PX) {
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
