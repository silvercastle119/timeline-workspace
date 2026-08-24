const DAY_IN_MS = 1000 * 60 * 60 * 24;

// Defensive upper bound on the number of dates getDatesInRange() will ever
// materialize, independent of any validation callers are expected to do —
// matches the project's max 10-year Timeline range plus a leap-year buffer.
const MAX_DATE_RANGE_DAYS = 366 * 10;

function parseDate(dateString: string) {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  return new Date(year, month - 1, day);
}

export function getDaysBetween(
  startDate: string,
  endDate: string
) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  return Math.round(
    (end.getTime() - start.getTime()) / DAY_IN_MS
  );
}

export function getDatesInRange(
  startDate: string,
  endDate: string
) {
  const totalDays = getDaysBetween(startDate, endDate);

  if (
    !Number.isFinite(totalDays) ||
    totalDays < 0 ||
    totalDays > MAX_DATE_RANGE_DAYS
  ) {
    return [];
  }

  return Array.from(
    { length: totalDays + 1 },
    (_, index) => addDays(startDate, index)
  );
}

export function getTimelineOffset(
  timelineStart: string,
  date: string
) {
  return getDaysBetween(timelineStart, date);
}

export function getTimelineDuration(
  startDate: string,
  endDate: string
) {
  return getDaysBetween(startDate, endDate) + 1;
}

export function addDays(
  dateString: string,
  days: number
) {
  const date = parseDate(dateString);

  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function getDayOfWeek(dateString: string) {
  return parseDate(dateString).getDay();
}

export function getWeekdayLabel(dateString: string) {
  return WEEKDAY_LABELS[getDayOfWeek(dateString)];
}

export function isSaturday(dateString: string) {
  return getDayOfWeek(dateString) === 6;
}

export function isSunday(dateString: string) {
  return getDayOfWeek(dateString) === 0;
}

export function isWeekend(dateString: string) {
  const day = getDayOfWeek(dateString);
  return day === 0 || day === 6;
}
