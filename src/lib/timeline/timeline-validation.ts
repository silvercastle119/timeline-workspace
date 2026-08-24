const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_TIMELINE_YEARS = 10;

export function isValidDateString(value: string): boolean {
  if (!DATE_STRING_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Latest end date allowed for a Timeline starting at `startDate`, given the
 * MAX_TIMELINE_YEARS cap. Returns null when startDate isn't a valid
 * YYYY-MM-DD string (used to drive <input type="date"> max attributes).
 */
export function getMaxTimelineEndDate(startDate: string): string | null {
  if (!isValidDateString(startDate)) return null;

  const [year, month, day] = startDate.split("-").map(Number);

  return formatDate(new Date(year + MAX_TIMELINE_YEARS, month - 1, day));
}

export type TimelineRangeValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateTimelineRange(
  startDate: string,
  endDate: string
): TimelineRangeValidationResult {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return {
      valid: false,
      reason: "Timeline 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)",
    };
  }

  if (startDate > endDate) {
    return {
      valid: false,
      reason: "Timeline 시작일은 종료일보다 늦을 수 없습니다.",
    };
  }

  const maxEndDate = getMaxTimelineEndDate(startDate);

  if (maxEndDate !== null && endDate > maxEndDate) {
    return {
      valid: false,
      reason: `Timeline 기간이 너무 깁니다. 최대 ${MAX_TIMELINE_YEARS}년까지 설정할 수 있습니다.`,
    };
  }

  return { valid: true };
}
