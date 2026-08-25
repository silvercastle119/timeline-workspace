import ExcelJS from "exceljs";
import { getDatesInRange, isSaturday, isSunday } from "@/lib/timeline/date-utils";
import {
  colorToExcelArgb,
  darkenColor,
  DEFAULT_BAR_COLOR,
} from "@/lib/work-items/color-utils";
import {
  filterOutInactiveSubtrees,
  getAggregateNamedColorSegments,
  getDisplayTimelines,
  getEffectiveWorkItemTimelines,
  getWorkItemDisplayRows,
} from "@/lib/work-items/tree-utils";
import type { Checkpoint, Project } from "@/types/project";

// Layout of the visible Gantt display sheet's header/data rows, its 메모
// column's header label, and its hidden id column's header label — shared
// with excel-import.ts, which now reverse-parses this sheet's cell colors/
// bold/merge structure as the sole source of truth for re-import (no
// separate data-entry sheet). The hidden `_id` column is what lets a
// re-import match a row back to an existing Work Item; a blank value means
// a brand-new row the user added directly in Excel.
export const DISPLAY_SHEET_HEADER_ROW_INDEX = 2;
export const DISPLAY_SHEET_FIRST_DATA_ROW_INDEX = 5;
export const DISPLAY_SHEET_MEMO_HEADER_LABEL = "메모";
export const DISPLAY_SHEET_ID_COLUMN_HEADER_LABEL = "_id";

const UNDECIDED_FILL_COLOR = "#d4d4d8";

// ---- Visual design tokens (styling only — no effect on the underlying
// data/merge/filtering logic below) ----
const KOREAN_FONT = "맑은 고딕";

const TITLE_FILL_COLOR = "#1F1F1F";
const TITLE_FONT_COLOR = "FFFFFFFF";

// Date-header hierarchy: darkest at the top (month), lightest at the
// bottom (day), per the design reference.
const MONTH_HEADER_FILL_COLOR = "#1F1F1F";
const MONTH_HEADER_FONT_COLOR = "FFFFFFFF";
const WEEK_HEADER_FILL_COLOR = "#5A5A5A";
const WEEK_HEADER_FONT_COLOR = "FFF2F2F2";
const DAY_HEADER_FILL_COLOR = "#F2F2F2";
const DAY_HEADER_FONT_COLOR = "FF333333";
const SATURDAY_TEXT_COLOR = "FF3B5BA5";
const SUNDAY_TEXT_COLOR = "FFB23B3B";

const INFO_HEADER_FILL_COLOR = "#FAFAFA";
const INFO_HEADER_FONT_COLOR = "FF262626";

// Grid: very light gray everywhere, a touch stronger only at meaningful
// boundaries (header/body split, month change, info/timeline split).
const LIGHT_GRID_COLOR = "#D9D9D9";
const HEADER_BODY_DIVIDER_COLOR = "#BFBFBF";
const MONTH_BOUNDARY_COLOR = "#8C8C8C";
const INFO_DIVIDER_COLOR = "#BFBFBF";

// Hierarchy rows: dark only at the top level (matches the title's use of
// black for top-level emphasis); progressively lighter below.
const DEPTH0_FILL_COLOR = "#1F1F1F";
const DEPTH0_FONT_COLOR = "FFFFFFFF";
const DEPTH1_FILL_COLOR = "#E0E0E0";
const DEPTH1_FONT_COLOR = "FF262626";
const LEAF_FONT_COLOR = "FF404040";
const MEMO_FONT_COLOR = "FF737373";

function hexToRgbTuple(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

/**
 * Picks readable text color (near-black or white) for a given fill.
 * Excel intentionally uses the exact same hex the web Timeline uses for
 * project colors — no re-lightening/darkening/desaturation — so this only
 * chooses legible label text, never alters the fill itself.
 */
function getContrastTextColor(hex: string): string {
  const [r, g, b] = hexToRgbTuple(hex);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  return luminance > 150 ? "FF262626" : "FFFFFFFF";
}

function columnNumberToLetter(columnNumber: number): string {
  let letter = "";
  let n = columnNumber;

  while (n > 0) {
    const remainder = (n - 1) % 26;

    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }

  return letter;
}

/** Applies the same border to every physical cell in a range — required
 * for merged blocks, since Excel renders each merged cell's own border on
 * its own edges rather than inheriting from the merge's master cell. */
function applyBorderToRange(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  border: Partial<ExcelJS.Borders>
) {
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const cell = sheet.getCell(row, col);

      cell.border = { ...cell.border, ...border };
    }
  }
}

// Excel worksheet names can't contain these characters and are capped at 31
// characters — this only normalizes the *sheet* name; project.name itself
// is left untouched everywhere else (title cell, _project metadata row).
const INVALID_WORKSHEET_NAME_CHARS = /[\\/*?:[\]]/g;
const WORKSHEET_NAME_MAX_LENGTH = 31;

function sanitizeWorksheetName(name: string): string {
  const sanitized = name
    .replace(INVALID_WORKSHEET_NAME_CHARS, "_")
    .trim();

  return (sanitized || "일정표").slice(0, WORKSHEET_NAME_MAX_LENGTH);
}

function getMonthKey(date: string) {
  return date.slice(0, 7);
}

function getWeekOfMonthKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const weekIndex = Math.ceil((day + firstWeekday) / 7);

  return `${year}-${month}-${weekIndex}`;
}

type ConsecutiveRun = { start: number; end: number; key: string };

function getConsecutiveRuns<T>(
  items: T[],
  keyFn: (item: T) => string
): ConsecutiveRun[] {
  if (items.length === 0) return [];

  const runs: ConsecutiveRun[] = [];
  let start = 0;

  for (let index = 1; index <= items.length; index++) {
    const isBoundary =
      index === items.length || keyFn(items[index]) !== keyFn(items[start]);

    if (isBoundary) {
      runs.push({ start, end: index - 1, key: keyFn(items[start]) });
      start = index;
    }
  }

  return runs;
}

export async function exportProjectToExcel(
  project: Project
): Promise<void> {
  const workItems = filterOutInactiveSubtrees(project.workItems);
  const effectiveTimelines = getEffectiveWorkItemTimelines(workItems);
  const displayTimelines = getDisplayTimelines(
    workItems,
    effectiveTimelines,
    { startDate: project.timelineStart, endDate: project.timelineEnd }
  );
  // Always fully expanded, regardless of the app's current collapse UI
  // state — the Timeline sheet is now the sole import source of truth, so
  // a collapsed row's Work Items must never simply be absent from the file
  // (excel-import.ts would otherwise have no way to tell "collapsed" apart
  // from "deleted").
  const displayRows = getWorkItemDisplayRows(
    workItems,
    new Set<string>(),
    displayTimelines
  );
  const timelineDates = getDatesInRange(
    project.timelineStart,
    project.timelineEnd
  );
  const dateColumnIndexByDate = new Map(
    timelineDates.map((date, index) => [date, index])
  );

  const maxDepth = displayRows.reduce(
    (max, row) => Math.max(max, row.depth),
    0
  );
  const hierarchyColumnCount = maxDepth + 1;
  const memoColumnIndex = hierarchyColumnCount + 1;
  const firstDateColumnIndex = memoColumnIndex + 1;
  const totalColumnCount =
    hierarchyColumnCount + 1 + timelineDates.length;
  // Appended after every visible column so none of the layout/merge/border
  // math above needs to account for it. Hidden, not veryHidden — this is
  // the match key excel-import.ts uses to tell "existing row the user
  // edited" apart from "brand-new row added directly in Excel".
  const idColumnIndex = totalColumnCount + 1;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sanitizeWorksheetName(project.name));
  sheet.getColumn(idColumnIndex).hidden = true;

  // ---- Row layout ----
  const titleRowIndex = 1;
  const monthRowIndex = DISPLAY_SHEET_HEADER_ROW_INDEX;
  const weekRowIndex = monthRowIndex + 1;
  const dayRowIndex = monthRowIndex + 2;
  const firstDataRowIndex = DISPLAY_SHEET_FIRST_DATA_ROW_INDEX;
  const lastDataRowIndex = firstDataRowIndex + displayRows.length - 1;

  sheet.getCell(monthRowIndex, idColumnIndex).value = DISPLAY_SHEET_ID_COLUMN_HEADER_LABEL;

  // Base grid: a uniform, very light gray border on every cell in the
  // header + data rectangle. Set first so later merges (which only need
  // to style their master cell) still end up with a consistent grid on
  // every edge, since every physical cell already carries it.
  applyBorderToRange(
    sheet,
    monthRowIndex,
    1,
    lastDataRowIndex,
    totalColumnCount,
    {
      top: { style: "thin", color: { argb: colorToExcelArgb(LIGHT_GRID_COLOR) } },
      left: { style: "thin", color: { argb: colorToExcelArgb(LIGHT_GRID_COLOR) } },
      bottom: { style: "thin", color: { argb: colorToExcelArgb(LIGHT_GRID_COLOR) } },
      right: { style: "thin", color: { argb: colorToExcelArgb(LIGHT_GRID_COLOR) } },
    }
  );

  // Freeze panes: the info columns (hierarchy + memo) stay put while the
  // date grid scrolls horizontally; the header rows stay put while the
  // work item rows scroll vertically.
  sheet.views = [
    {
      state: "frozen",
      xSplit: memoColumnIndex,
      ySplit: dayRowIndex,
      topLeftCell: `${columnNumberToLetter(firstDateColumnIndex)}${firstDataRowIndex}`,
      showGridLines: false,
    },
  ];

  // Title row — split into two merges (left info area / right timeline
  // area) instead of one merge spanning the full width. A merged cell
  // that straddles the freeze pane's column split (xSplit above) is
  // undefined/inconsistently rendered across Excel/Numbers/Sheets, which
  // is exactly what made the project name appear to leak into the
  // scrolling Timeline area. The actual title text lives only in the
  // left (frozen) merge, so it — like the project name column — never
  // sits in the part of the sheet that scrolls horizontally.
  const titleCell = sheet.getCell(titleRowIndex, 1);

  titleCell.value = `${project.name} 일정표`;
  titleCell.font = { name: KOREAN_FONT, bold: true, size: 16, color: { argb: TITLE_FONT_COLOR } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colorToExcelArgb(TITLE_FILL_COLOR) },
  };
  sheet.mergeCells(titleRowIndex, 1, titleRowIndex, memoColumnIndex);

  if (totalColumnCount > memoColumnIndex) {
    const titleTimelineCell = sheet.getCell(titleRowIndex, memoColumnIndex + 1);

    titleTimelineCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorToExcelArgb(TITLE_FILL_COLOR) },
    };
    sheet.mergeCells(
      titleRowIndex,
      memoColumnIndex + 1,
      titleRowIndex,
      totalColumnCount
    );
  }

  sheet.getRow(titleRowIndex).height = 30;

  // Info-column headers: hierarchy columns collapse into a single blank
  // header (no "1단계/2단계" labels), memo keeps its label — both span
  // all three date-header rows above the data.
  const hierarchyHeaderCell = sheet.getCell(monthRowIndex, 1);

  hierarchyHeaderCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colorToExcelArgb(INFO_HEADER_FILL_COLOR) },
  };
  sheet.mergeCells(monthRowIndex, 1, dayRowIndex, hierarchyColumnCount);

  const memoHeaderCell = sheet.getCell(monthRowIndex, memoColumnIndex);

  memoHeaderCell.value = DISPLAY_SHEET_MEMO_HEADER_LABEL;
  memoHeaderCell.font = { name: KOREAN_FONT, bold: true, size: 10, color: { argb: INFO_HEADER_FONT_COLOR } };
  memoHeaderCell.alignment = { horizontal: "center", vertical: "middle" };
  memoHeaderCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colorToExcelArgb(INFO_HEADER_FILL_COLOR) },
  };
  sheet.mergeCells(monthRowIndex, memoColumnIndex, dayRowIndex, memoColumnIndex);

  // Month band (darkest)
  const monthRuns = getConsecutiveRuns(timelineDates, getMonthKey);

  monthRuns.forEach((run) => {
    const startColumn = firstDateColumnIndex + run.start;
    const endColumn = firstDateColumnIndex + run.end;
    const [year, month] = run.key.split("-").map(Number);
    const cell = sheet.getCell(monthRowIndex, startColumn);

    cell.value = `${year}년 ${month}월`;
    cell.font = { name: KOREAN_FONT, bold: true, size: 11, color: { argb: MONTH_HEADER_FONT_COLOR } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorToExcelArgb(MONTH_HEADER_FILL_COLOR) },
    };

    if (endColumn > startColumn) {
      sheet.mergeCells(monthRowIndex, startColumn, monthRowIndex, endColumn);
    }
  });

  // Week-of-month band (medium)
  getConsecutiveRuns(timelineDates, getWeekOfMonthKey).forEach((run) => {
    const startColumn = firstDateColumnIndex + run.start;
    const endColumn = firstDateColumnIndex + run.end;
    const weekIndex = Number(run.key.split("-")[2]);
    const cell = sheet.getCell(weekRowIndex, startColumn);

    cell.value = `${weekIndex}주`;
    cell.font = { name: KOREAN_FONT, size: 9, color: { argb: WEEK_HEADER_FONT_COLOR } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorToExcelArgb(WEEK_HEADER_FILL_COLOR) },
    };

    if (endColumn > startColumn) {
      sheet.mergeCells(weekRowIndex, startColumn, weekRowIndex, endColumn);
    }
  });

  // Day row (lightest) — day number only; month/week are already shown
  // above, so the full date isn't repeated here.
  timelineDates.forEach((date, index) => {
    const cell = sheet.getCell(dayRowIndex, firstDateColumnIndex + index);
    const saturday = isSaturday(date);
    const sunday = isSunday(date);

    cell.value = Number(date.slice(8, 10));
    cell.font = {
      name: KOREAN_FONT,
      bold: true,
      size: 9,
      color: saturday
        ? { argb: SATURDAY_TEXT_COLOR }
        : sunday
          ? { argb: SUNDAY_TEXT_COLOR }
          : { argb: DAY_HEADER_FONT_COLOR },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorToExcelArgb(DAY_HEADER_FILL_COLOR) },
    };
  });

  sheet.getRow(monthRowIndex).height = 20;
  sheet.getRow(weekRowIndex).height = 16;
  sheet.getRow(dayRowIndex).height = 20;

  // Header/body separator: a slightly stronger rule under the whole
  // header block.
  applyBorderToRange(sheet, dayRowIndex, 1, dayRowIndex, totalColumnCount, {
    bottom: { style: "thin", color: { argb: colorToExcelArgb(HEADER_BODY_DIVIDER_COLOR) } },
  });

  // Data rows
  displayRows.forEach((row, rowIndex) => {
    const excelRowIndex = firstDataRowIndex + rowIndex;
    const nameCell = sheet.getCell(excelRowIndex, row.depth + 1);

    nameCell.value = row.item.name;
    nameCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };

    if (row.depth === 0) {
      nameCell.font = { name: KOREAN_FONT, bold: true, size: 11, color: { argb: DEPTH0_FONT_COLOR } };
      nameCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorToExcelArgb(DEPTH0_FILL_COLOR) },
      };
    } else if (row.depth === 1) {
      nameCell.font = { name: KOREAN_FONT, bold: true, size: 10, color: { argb: DEPTH1_FONT_COLOR } };
      nameCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorToExcelArgb(DEPTH1_FILL_COLOR) },
      };
    } else {
      nameCell.font = { name: KOREAN_FONT, size: 10, color: { argb: LEAF_FONT_COLOR } };
    }

    const memoCell = sheet.getCell(excelRowIndex, memoColumnIndex);

    memoCell.value = row.item.memo || "";
    memoCell.font = { name: KOREAN_FONT, italic: true, size: 9, color: { argb: MEMO_FONT_COLOR } };
    memoCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

    // Hidden id column, out of sight — informational only, see comment
    // where idColumnIndex is computed above.
    sheet.getCell(excelRowIndex, idColumnIndex).value = row.item.id;

    sheet.getRow(excelRowIndex).height = 20;

    if (!row.timelineBar) return;

    const { timeline } = row.timelineBar;

    // Checkpoints only apply to manual (non-autoTimeline), decided rows —
    // same eligibility as the web Timeline bar's own checkpoint markers,
    // since an auto-aggregated row's fill is a blend of children's colors
    // with no single "own color" a checkpoint could be derived from.
    const checkpointByDate =
      !row.item.autoTimeline && !row.item.isUndecided
        ? new Map(
            row.item.checkpoints.map((checkpoint) => [checkpoint.date, checkpoint])
          )
        : new Map<string, Checkpoint>();

    // Auto-aggregated rows split into one segment per actual change in
    // which child work items are active — not just per same-color run —
    // so overlapping children show as "childA / childB" exactly where
    // their date ranges actually overlap. Manual rows are always a single
    // named segment (the item itself) across its own date range, except at
    // a checkpoint date, which breaks out into its own single-cell segment
    // (darker fill, own label) so it reads the same way the web Timeline's
    // checkpoint marker does — one date, standing out from the bar around it.
    const segments = row.item.autoTimeline
      ? getAggregateNamedColorSegments(workItems, row.item, timeline).map(
          (segment) => ({
            date: segment.date,
            color: segment.color,
            label: segment.names.join(" / "),
            isCheckpoint: false,
          })
        )
      : timelineDates
          .filter(
            (date) =>
              date >= timeline.startDate && date <= timeline.endDate
          )
          .map((date) => {
            const baseColor = row.item.isUndecided
              ? UNDECIDED_FILL_COLOR
              : (row.item.color ?? DEFAULT_BAR_COLOR);
            const checkpoint = checkpointByDate.get(date);

            if (checkpoint) {
              return {
                date,
                color: darkenColor(baseColor, 0.22),
                label: checkpoint.label,
                isCheckpoint: true,
              };
            }

            return {
              date,
              color: baseColor,
              label: row.item.name,
              isCheckpoint: false,
            };
          });

    // Group consecutive dates that share both the same color AND the same
    // contributing label into merged cell ranges instead of filling one
    // cell per date. A checkpoint segment never merges with its neighbors
    // (even if a name/color happened to coincide) — it always stays its
    // own single cell, just filled a shade darker than the bar around it.
    let index = 0;

    while (index < segments.length) {
      const { color, label, isCheckpoint } = segments[index];
      let end = index;

      if (!isCheckpoint) {
        while (
          end + 1 < segments.length &&
          !segments[end + 1].isCheckpoint &&
          segments[end + 1].color === color &&
          segments[end + 1].label === label
        ) {
          end++;
        }
      }

      const startDateIndex = dateColumnIndexByDate.get(segments[index].date);
      const endDateIndex = dateColumnIndexByDate.get(segments[end].date);

      if (startDateIndex === undefined || endDateIndex === undefined) {
        index = end + 1;
        continue;
      }

      const startColumn = firstDateColumnIndex + startDateIndex;
      const endColumn = firstDateColumnIndex + endDateIndex;
      const textColor = getContrastTextColor(color);

      if (endColumn > startColumn) {
        sheet.mergeCells(
          excelRowIndex,
          startColumn,
          excelRowIndex,
          endColumn
        );
      }

      const barCell = sheet.getCell(excelRowIndex, startColumn);

      if (label) barCell.value = label;
      barCell.font = {
        name: KOREAN_FONT,
        size: 9,
        bold: isCheckpoint,
        color: { argb: textColor },
      };
      barCell.alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
      barCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorToExcelArgb(color) },
      };

      index = end + 1;
    }
  });

  // Vertical merges: each row's own hierarchy column spans over its
  // descendant rows, mirroring the web Display Row Model exactly.
  displayRows.forEach((row, index) => {
    let span = 1;
    let next = index + 1;

    while (
      next < displayRows.length &&
      displayRows[next].depth > row.depth
    ) {
      span++;
      next++;
    }

    if (span > 1) {
      const excelRowIndex = firstDataRowIndex + index;

      sheet.mergeCells(
        excelRowIndex,
        row.depth + 1,
        excelRowIndex + span - 1,
        row.depth + 1
      );
    }
  });

  // Vertical divider separating the info columns (hierarchy + memo) from
  // the date grid, across the full header + data height.
  applyBorderToRange(
    sheet,
    monthRowIndex,
    memoColumnIndex,
    lastDataRowIndex,
    memoColumnIndex,
    { right: { style: "thin", color: { argb: colorToExcelArgb(INFO_DIVIDER_COLOR) } } }
  );

  // Vertical rule at each month boundary, running through the full
  // header + data height.
  monthRuns.forEach((run, runIndex) => {
    if (runIndex === 0) return;

    const boundaryColumn = firstDateColumnIndex + run.start;

    applyBorderToRange(
      sheet,
      monthRowIndex,
      boundaryColumn,
      lastDataRowIndex,
      boundaryColumn,
      { left: { style: "thin", color: { argb: colorToExcelArgb(MONTH_BOUNDARY_COLOR) } } }
    );
  });

  sheet.getColumn(1).width = 20;

  for (let depth = 1; depth < hierarchyColumnCount; depth++) {
    sheet.getColumn(depth + 1).width = 16;
  }

  sheet.getColumn(memoColumnIndex).width = 20;

  for (let index = 0; index < timelineDates.length; index++) {
    sheet.getColumn(firstDateColumnIndex + index).width = 6;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${project.name || "timeline"}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
