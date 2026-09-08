import type { TimelineRangeValidationCode } from "@/lib/timeline/timeline-validation";
import { MAX_TIMELINE_YEARS } from "@/lib/timeline/timeline-validation";
import type { TranslateFn } from "./use-t";

/** Maps a Timeline range validation code to a translated, user-facing message. */
export function translateTimelineRangeError(
  code: TimelineRangeValidationCode,
  t: TranslateFn,
): string {
  switch (code) {
    case "invalid-format":
      return t("Timeline 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
    case "start-after-end":
      return t("Timeline 시작일은 종료일보다 늦을 수 없습니다.");
    case "range-too-long":
      return t(
        "Timeline 기간이 너무 깁니다. 최대 {years}년까지 설정할 수 있습니다.",
        { years: MAX_TIMELINE_YEARS },
      );
  }
}
