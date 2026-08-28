"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { useMobileProject } from "@/components/mobile/use-mobile-project";
import {
  computeMobileDropIndicator,
  type DropIndicator,
} from "@/components/mobile/mobile-tree-drag";
import {
  getDisplayTimelines,
  getEffectiveWorkItemTimelines,
  getInactiveSubtreeIds,
  getWorkItemDisplayRows,
} from "@/lib/work-items/tree-utils";
import { DEFAULT_BAR_COLOR } from "@/lib/work-items/color-utils";

const HOLD_MS = 350;
const MOVE_PX = 8;
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_SPEED = 10;

// ISO 날짜 문자열("YYYY-MM-DD")은 항상 2자리 zero-pad이므로 "MM/DD"로 변환한다.
function formatShortDate(isoDate: string) {
  return `${isoDate.slice(5, 7)}/${isoDate.slice(8, 10)}`;
}

type DragItemInfo = { id: string; name: string; color: string | null };

type PressState = {
  itemId: string;
  startX: number;
  startY: number;
  width: number;
  timer: ReturnType<typeof setTimeout>;
  dragging: boolean;
};

type GhostState = {
  itemId: string;
  x: number;
  y: number;
  width: number;
  name: string;
  color: string | null;
};

export function MobileHierarchyScreen() {
  const { project, isLoaded, addWorkItem, moveWorkItem, collapsedItemIds, toggleCollapsedItem } =
    useMobileProject();
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const router = useRouter();

  const listRef = useRef<HTMLDivElement | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const dropIndicatorRef = useRef<DropIndicator | null>(null);
  const autoScrollDirectionRef = useRef(0);
  const autoScrollFrameRef = useRef<number | null>(null);

  const inactiveIds = useMemo(
    () => getInactiveSubtreeIds(project.workItems),
    [project.workItems]
  );

  const displayRows = useMemo(() => {
    const effectiveTimelines = getEffectiveWorkItemTimelines(project.workItems);
    const displayTimelines = getDisplayTimelines(project.workItems, effectiveTimelines, {
      startDate: project.timelineStart,
      endDate: project.timelineEnd,
    });

    return getWorkItemDisplayRows(project.workItems, collapsedItemIds, displayTimelines);
  }, [project.workItems, project.timelineStart, project.timelineEnd, collapsedItemIds]);

  const stopAutoScroll = () => {
    autoScrollDirectionRef.current = 0;

    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  const runAutoScroll = () => {
    const container = listRef.current;

    if (!container || autoScrollDirectionRef.current === 0) {
      autoScrollFrameRef.current = null;
      return;
    }

    container.scrollTop += autoScrollDirectionRef.current * AUTO_SCROLL_SPEED;
    autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
  };

  const updateAutoScroll = (clientY: number) => {
    const container = listRef.current;

    if (!container) return;

    const rect = container.getBoundingClientRect();
    let direction = 0;

    if (clientY - rect.top < AUTO_SCROLL_EDGE_PX) {
      direction = -1;
    } else if (rect.bottom - clientY < AUTO_SCROLL_EDGE_PX) {
      direction = 1;
    }

    autoScrollDirectionRef.current = direction;

    if (direction !== 0 && autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
    }
  };

  const beginDrag = (item: DragItemInfo, pending: PressState) => {
    pending.dragging = true;
    setGhost({
      itemId: item.id,
      x: pending.startX,
      y: pending.startY,
      width: pending.width,
      name: item.name,
      color: item.color,
    });
  };

  const handleRowPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    item: DragItemInfo
  ) => {
    if ((event.target as HTMLElement).closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = event.currentTarget.getBoundingClientRect();

    pressRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      dragging: false,
      timer: setTimeout(() => {
        const current = pressRef.current;

        if (current && current.itemId === item.id && !current.dragging) {
          beginDrag(item, current);
        }
      }, HOLD_MS),
    };
  };

  const handleRowPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
    item: DragItemInfo
  ) => {
    const pending = pressRef.current;

    if (!pending || pending.itemId !== item.id) return;

    if (!pending.dragging) {
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);

      if (distance <= MOVE_PX) return;

      clearTimeout(pending.timer);
      beginDrag(item, pending);
    }

    setGhost((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));

    const containerRect = listRef.current?.getBoundingClientRect() ?? null;
    const indicator = computeMobileDropIndicator(
      project.workItems,
      pending.itemId,
      event.clientX,
      event.clientY,
      containerRect
    );

    dropIndicatorRef.current = indicator;
    setDropIndicator(indicator);
    updateAutoScroll(event.clientY);
  };

  const handleRowPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
    item: DragItemInfo
  ) => {
    const pending = pressRef.current;

    if (!pending || pending.itemId !== item.id) return;

    clearTimeout(pending.timer);

    if (pending.dragging) {
      if (dropIndicatorRef.current) {
        moveWorkItem(pending.itemId, dropIndicatorRef.current);
      }
    } else {
      router.push(`/m/schedule/${item.id}`);
    }

    pressRef.current = null;
    dropIndicatorRef.current = null;
    setGhost(null);
    setDropIndicator(null);
    stopAutoScroll();
  };

  const handleRowPointerCancel = () => {
    const pending = pressRef.current;

    if (pending) clearTimeout(pending.timer);

    pressRef.current = null;
    dropIndicatorRef.current = null;
    setGhost(null);
    setDropIndicator(null);
    stopAutoScroll();
  };

  const handleAddWorkItem = () => {
    const newId = addWorkItem(null);
    router.push(`/m/schedule/${newId}`);
  };

  if (!isLoaded) {
    return <div className="p-4 text-sm text-zinc-500">불러오는 중...</div>;
  }

  return (
    <div ref={listRef} className="relative h-full overflow-auto">
      {ghost && dropIndicator?.mode === "root" && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[3px] bg-blue-400/60" />
      )}

      {displayRows.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">등록된 업무가 없습니다.</p>
      ) : (
        displayRows.map(({ item, depth, hasChildren }) => {
          const isDropTarget =
            dropIndicator !== null &&
            dropIndicator.mode !== "root" &&
            dropIndicator.targetItemId === item.id;
          const isBeingDragged = ghost?.itemId === item.id;

          const dropBorderClass = !isDropTarget
            ? "border-t-transparent border-b-zinc-100"
            : dropIndicator?.mode === "before"
              ? "border-t-blue-400/70 border-b-zinc-100"
              : dropIndicator?.mode === "after"
                ? "border-t-transparent border-b-blue-400/70"
                : "border-t-transparent border-b-zinc-100";
          const backgroundClass =
            isDropTarget && dropIndicator?.mode === "child" ? "bg-blue-50" : "";

          return (
            <div
              key={item.id}
              data-row-id={item.id}
              onPointerDown={(event) => handleRowPointerDown(event, item)}
              onPointerMove={(event) => handleRowPointerMove(event, item)}
              onPointerUp={(event) => handleRowPointerUp(event, item)}
              onPointerCancel={handleRowPointerCancel}
              className={`flex touch-none select-none items-center gap-2 border-t border-b py-3 pr-4 transition ${dropBorderClass} ${backgroundClass} ${
                isBeingDragged ? "opacity-30" : ""
              } ${inactiveIds.has(item.id) ? "opacity-40" : ""}`}
              style={{ paddingLeft: 16 + depth * 16 }}
            >
              <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                {hasChildren && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCollapsedItem(item.id);
                    }}
                    aria-label={collapsedItemIds.has(item.id) ? "펼치기" : "접기"}
                    className="absolute -inset-3 flex items-center justify-center text-2xl text-zinc-400"
                  >
                    {collapsedItemIds.has(item.id) ? "▸" : "▾"}
                  </button>
                )}
              </span>

              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? DEFAULT_BAR_COLOR }}
              />

              <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{item.name}</span>

              {item.startDate && item.endDate && (
                <span className="shrink-0 text-xs text-zinc-400">
                  {formatShortDate(item.startDate)} ~ {formatShortDate(item.endDate)}
                </span>
              )}
            </div>
          );
        })
      )}

      <button
        type="button"
        onClick={handleAddWorkItem}
        className="flex w-full items-center justify-center gap-1 border-t border-zinc-100 py-3.5 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-blue-600"
      >
        + 업무 추가
      </button>

      {ghost && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-xl"
          style={{
            left: ghost.x - 24,
            top: ghost.y - 20,
            width: ghost.width,
            transform: "scale(0.97)",
            opacity: 0.95,
          }}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: ghost.color ?? DEFAULT_BAR_COLOR }}
          />
          <span className="min-w-0 flex-1 truncate">{ghost.name}</span>
        </div>
      )}
    </div>
  );
}
