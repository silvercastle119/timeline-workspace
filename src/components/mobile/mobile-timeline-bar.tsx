import type { CSSProperties } from "react";
import { getDaysBetween, getTimelineDuration } from "@/lib/timeline/date-utils";
import type { Checkpoint } from "@/types/project";

type MobileTimelineBarProps = {
  startDate: string | null;
  endDate: string | null;
  checkpoints: Checkpoint[];
  background: CSSProperties;
};

export function MobileTimelineBar({
  startDate,
  endDate,
  checkpoints,
  background,
}: MobileTimelineBarProps) {
  if (!startDate || !endDate) {
    return (
      <div className="flex h-8 w-full items-center justify-center rounded-md border border-dashed border-zinc-300 text-xs text-zinc-400">
        날짜를 설정해주세요
      </div>
    );
  }

  const duration = getTimelineDuration(startDate, endDate);

  return (
    <div>
      <div className="relative h-8 w-full rounded-md" style={background}>
        {checkpoints.map((checkpoint) => {
          const offset = getDaysBetween(startDate, checkpoint.date);
          const percent = duration > 1 ? (offset / (duration - 1)) * 100 : 50;
          const clampedPercent = Math.min(100, Math.max(0, percent));

          return (
            <div
              key={checkpoint.id}
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900 shadow"
              style={{ left: `${clampedPercent}%` }}
              title={checkpoint.label || checkpoint.date}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-zinc-500">
        <span>{startDate}</span>
        <span>{endDate}</span>
      </div>
    </div>
  );
}
