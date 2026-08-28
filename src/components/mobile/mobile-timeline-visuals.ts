import type { CSSProperties } from "react";
import { getAggregateColorSegments, type WorkItemTimeline } from "@/lib/work-items/tree-utils";
import { DEFAULT_BAR_COLOR } from "@/lib/work-items/color-utils";
import type { WorkItem } from "@/types/project";

// PC의 getBarBackground(page.tsx:712~743행, export 안 된 로컬 함수)와
// 동일한 규칙을 그대로 복제한다. isUndecided → 빗금, !autoTimeline → 단색,
// autoTimeline → getAggregateColorSegments(이미 export된 공용 함수)로 구한
// "하루 단위" 세그먼트를 이어붙인 linear-gradient. Section을 나누는 것이
// 아니라 날짜 해상도의 그라디언트이며, 겹치는 날짜는 blendColors로 섞인
// 색 하나가 그 칸에 들어간다 — PC와 동일한 방식이다.
const UNDECIDED_STRIPE_BACKGROUND =
  "repeating-linear-gradient(45deg, #d4d4d8, #d4d4d8 4px, #f4f4f5 4px, #f4f4f5 8px)";

export function getMobileBarBackground(
  item: WorkItem,
  timeline: WorkItemTimeline,
  workItems: WorkItem[]
): CSSProperties {
  if (item.isUndecided) {
    return { background: UNDECIDED_STRIPE_BACKGROUND };
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
