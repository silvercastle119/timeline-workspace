"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMobileProject } from "@/components/mobile/use-mobile-project";
import {
  getDisplayTimelines,
  getEffectiveWorkItemTimelines,
  getInactiveSubtreeIds,
  getWorkItemDisplayRows,
} from "@/lib/work-items/tree-utils";
import { getDatesInRange, getDaysBetween, getTimelineDuration } from "@/lib/timeline/date-utils";
import { getMobileBarBackground } from "@/components/mobile/mobile-timeline-visuals";

const DAY_WIDTH = 28;
const NAME_COLUMN_WIDTH = 128;
const ROW_HEIGHT = 40;
const MONTH_ROW_HEIGHT = 20;
const DAY_ROW_HEIGHT = 24;

export function MobileTimelineScreen() {
  const { project, isLoaded, collapsedItemIds } = useMobileProject();
  const router = useRouter();

  const inactiveIds = useMemo(
    () => getInactiveSubtreeIds(project.workItems),
    [project.workItems]
  );

  const rows = useMemo(() => {
    const effectiveTimelines = getEffectiveWorkItemTimelines(project.workItems);
    const displayTimelines = getDisplayTimelines(project.workItems, effectiveTimelines, {
      startDate: project.timelineStart,
      endDate: project.timelineEnd,
    });

    // 목록(/m)과 동일한 collapsedItemIds를 사용 — 목록에서 접은 하위 업무는
    // Timeline에서도 같은 getWorkItemDisplayRows 계산으로 자연히 숨겨진다.
    return getWorkItemDisplayRows(project.workItems, collapsedItemIds, displayTimelines);
  }, [project.workItems, project.timelineStart, project.timelineEnd, collapsedItemIds]);

  const dates = useMemo(
    () => getDatesInRange(project.timelineStart, project.timelineEnd),
    [project.timelineStart, project.timelineEnd]
  );

  // 월 단위로 묶어서 상단 헤더를 "월(그룹 1회) → 일(칸마다)" 2단으로 표시한다.
  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; dayCount: number }[] = [];

    dates.forEach((date) => {
      const monthKey = date.slice(0, 7);
      const last = groups[groups.length - 1];

      if (last && last.key === monthKey) {
        last.dayCount += 1;
      } else {
        groups.push({ key: monthKey, label: `${Number(date.slice(5, 7))}월`, dayCount: 1 });
      }
    });

    return groups;
  }, [dates]);

  if (!isLoaded) {
    return <div className="p-4 text-sm text-zinc-500">불러오는 중...</div>;
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-zinc-500">등록된 업무가 없습니다.</p>;
  }

  const totalWidth = dates.length * DAY_WIDTH;

  return (
    <div className="h-full overflow-auto">
      <div style={{ width: NAME_COLUMN_WIDTH + totalWidth }}>
        <div>
          <div className="flex border-b border-zinc-100" style={{ height: MONTH_ROW_HEIGHT }}>
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-zinc-200 bg-white"
              style={{ width: NAME_COLUMN_WIDTH }}
            />
            {monthGroups.map((group) => (
              <div
                key={group.key}
                className="shrink-0 border-r border-zinc-200 text-center text-[11px] font-medium text-zinc-600"
                style={{
                  width: group.dayCount * DAY_WIDTH,
                  lineHeight: `${MONTH_ROW_HEIGHT}px`,
                }}
              >
                {group.label}
              </div>
            ))}
          </div>
          <div className="flex border-b border-zinc-200 bg-white" style={{ height: DAY_ROW_HEIGHT }}>
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-zinc-200 bg-white"
              style={{ width: NAME_COLUMN_WIDTH }}
            />
            {dates.map((date) => (
              <div
                key={date}
                className="shrink-0 border-r border-zinc-100 text-center text-[11px] text-zinc-400"
                style={{ width: DAY_WIDTH, lineHeight: `${DAY_ROW_HEIGHT}px` }}
              >
                {Number(date.slice(8, 10))}
              </div>
            ))}
          </div>
        </div>

        {rows.map(({ item, depth, timelineBar }) => {
          const isFaded = inactiveIds.has(item.id);

          return (
            <div key={item.id} className="flex border-b border-zinc-100" style={{ height: ROW_HEIGHT }}>
              <div
                className={`sticky left-0 z-10 flex shrink-0 items-center truncate border-r border-zinc-200 bg-white px-2 text-xs text-zinc-700 ${
                  isFaded ? "opacity-40" : ""
                }`}
                style={{ width: NAME_COLUMN_WIDTH, paddingLeft: 8 + depth * 10 }}
              >
                {item.name}
              </div>
              <div className="relative shrink-0" style={{ width: totalWidth }}>
                {timelineBar && (
                  <button
                    type="button"
                    onClick={() => router.push(`/m/schedule/${item.id}`)}
                    aria-label={`${item.name} 설정으로 이동`}
                    className={`absolute top-1/2 h-5 -translate-y-1/2 rounded ${
                      isFaded ? "opacity-40" : ""
                    }`}
                    style={{
                      left:
                        getDaysBetween(project.timelineStart, timelineBar.timeline.startDate) *
                        DAY_WIDTH,
                      width: Math.max(
                        DAY_WIDTH,
                        getTimelineDuration(
                          timelineBar.timeline.startDate,
                          timelineBar.timeline.endDate
                        ) * DAY_WIDTH
                      ),
                      ...getMobileBarBackground(item, timelineBar.timeline, project.workItems),
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
