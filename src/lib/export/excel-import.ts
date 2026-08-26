import ExcelJS from "exceljs";
import {
  DEFAULT_ORDER_STEP,
  clampCheckpointsToRange,
  getInactiveSubtreeIds,
  normalizeWorkItem,
} from "@/lib/work-items/tree-utils";
import {
  DEFAULT_COLOR_PALETTE,
  isDarkerVariant,
  lightenColor,
} from "@/lib/work-items/color-utils";
import { validateTimelineRange } from "@/lib/timeline/timeline-validation";
import type { Checkpoint, Project, WorkItem } from "@/types/project";
import {
  DISPLAY_SHEET_HEADER_ROW_INDEX,
  DISPLAY_SHEET_FIRST_DATA_ROW_INDEX,
  DISPLAY_SHEET_ID_COLUMN_HEADER_LABEL,
  DISPLAY_SHEET_MEMO_HEADER_LABEL,
} from "@/lib/export/excel-export";

export class ExcelImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelImportError";
  }
}

/** Excel import is rejected outright above this file size — kept in one
 * place so the UI-level pre-check and the parser's own defense agree. */
export const MAX_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Max number of Work Item rows accepted from the Gantt sheet in a single
 * import. */
export const MAX_IMPORT_WORK_ITEMS = 50_000;

// Must match the amount excel-export.ts's darkenColor(baseColor, 0.22) uses
// for a checkpoint cell's fill — used to reverse-derive a row's base color
// when there's no non-checkpoint cell in the row to sample it from (a 1-day
// item whose only day is also its checkpoint).
const CHECKPOINT_DARKEN_AMOUNT = 0.22;

const MONTH_HEADER_ROW_INDEX = DISPLAY_SHEET_HEADER_ROW_INDEX;
const DAY_HEADER_ROW_INDEX = DISPLAY_SHEET_HEADER_ROW_INDEX + 2;
const TITLE_ROW_INDEX = 1;

const MONTH_HEADER_PATTERN = /^(\d{4})년\s*(\d{1,2})월$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text ?? "");
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    const result = (value as ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue).result;

    if (result === null || result === undefined) return "";
    if (result instanceof Date) return result.toISOString().slice(0, 10);
    if (typeof result === "object") return "";

    return String(result);
  }

  return String(value);
}

function argbToHex(argb: string | undefined): string | null {
  if (!argb || argb.length < 8) return null;

  return `#${argb.slice(argb.length - 6).toUpperCase()}`;
}

function getFillHex(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill;

  if (!fill || fill.type !== "pattern") return null;

  return argbToHex(fill.fgColor?.argb);
}

function mostCommonHex(hexes: string[]): string {
  const counts = new Map<string, number>();

  hexes.forEach((hex) => counts.set(hex, (counts.get(hex) ?? 0) + 1));

  let best = hexes[0];
  let bestCount = 0;

  counts.forEach((count, hex) => {
    if (count > bestCount) {
      best = hex;
      bestCount = count;
    }
  });

  return best;
}

/**
 * Maps every date-grid column to its YYYY-MM-DD date by combining the
 * month-header row's merged "YYYY년 M월" text with the day-header row's
 * bare day-of-month number — see the Excel Import redesign plan, section 1
 * (Q1/Q2). A column missing either piece (a stray/corrupted column) is
 * simply left out of the map rather than failing the whole import.
 */
function buildDateColumnMap(sheet: ExcelJS.Worksheet): Map<number, string> {
  const map = new Map<number, string>();
  const maxCol = sheet.columnCount;

  for (let col = 1; col <= maxCol; col++) {
    const dayValue = sheet.getCell(DAY_HEADER_ROW_INDEX, col).value;

    if (typeof dayValue !== "number" || dayValue < 1 || dayValue > 31) continue;

    const monthText = cellToString(sheet.getCell(MONTH_HEADER_ROW_INDEX, col).value);
    const match = MONTH_HEADER_PATTERN.exec(monthText);

    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);

    map.set(col, `${year}-${pad2(month)}-${pad2(dayValue)}`);
  }

  return map;
}

function findColumnByHeaderLabel(
  sheet: ExcelJS.Worksheet,
  headerRowIndex: number,
  label: string,
  maxCol: number
): number | null {
  for (let col = 1; col <= maxCol; col++) {
    if (cellToString(sheet.getCell(headerRowIndex, col).value) === label) return col;
  }

  return null;
}

/**
 * Finds the hierarchy column (1-indexed, from the right) whose value
 * *originates* at this row — i.e. it's this row's own name, not a value
 * inherited from an ancestor's vertical merge spilling down through it.
 * `cell.master.row === row` is the signal (see plan section 1, Q5): a
 * non-merged cell's master is itself, a merged cell's master is its
 * merge's anchor row.
 */
function detectOwnDepthAndName(
  sheet: ExcelJS.Worksheet,
  row: number,
  memoColumnIndex: number
): { depth: number; name: string } | null {
  for (let col = memoColumnIndex - 1; col >= 1; col--) {
    const cell = sheet.getCell(row, col);
    const value = cell.value;

    if (value === null || value === undefined || value === "") continue;

    // ExcelJS's .d.ts types Cell.master.row as the Address interface's
    // string field, but the runtime getter (lib/doc/cell.js) actually
    // returns a number (this._row.number) — Number() here normalizes
    // either representation instead of relying on which one is accurate.
    const isOwn = !cell.isMerged || Number(cell.master.row) === row;

    if (isOwn) return { depth: col - 1, name: cellToString(value) };
  }

  return null;
}

type RowDateCell = {
  col: number;
  date: string;
  hex: string;
  label: string;
  isCheckpointCandidate: boolean;
};

function scanRowFilledCells(
  sheet: ExcelJS.Worksheet,
  row: number,
  sortedDateColumns: number[],
  dateColumnMap: Map<number, string>
): RowDateCell[] {
  const cells: RowDateCell[] = [];

  for (const col of sortedDateColumns) {
    const cell = sheet.getCell(row, col);
    const hex = getFillHex(cell);

    if (!hex) continue;

    cells.push({
      col,
      date: dateColumnMap.get(col)!,
      hex,
      label: cellToString(cell.value),
      isCheckpointCandidate: Boolean(cell.font?.bold) && !cell.isMerged,
    });
  }

  return cells;
}

type RowDateRange = {
  startDate: string | null;
  endDate: string | null;
  color: string | null;
  checkpoints: Checkpoint[];
};

/**
 * Two-stage checkpoint classification — see plan section 3. Stage 1 (bold +
 * unmerged) already ran in scanRowFilledCells; this is stage 2: confirm
 * candidates against the row's own base color, or — when there's no normal
 * cell to compare against (a 1-day item whose only day is its checkpoint,
 * plan's "G′" case) — reverse-derive the base color by lightening the
 * checkpoint color back by the same amount export darkened it.
 */
function classifyRowCells(cells: RowDateCell[]): RowDateRange {
  if (cells.length === 0) {
    return { startDate: null, endDate: null, color: null, checkpoints: [] };
  }

  const normalCells = cells.filter((cell) => !cell.isCheckpointCandidate);
  const candidateCells = cells.filter((cell) => cell.isCheckpointCandidate);

  let baseColor: string;
  let confirmedCheckpointCells: RowDateCell[];
  const demotedCells: RowDateCell[] = [];

  if (normalCells.length > 0) {
    baseColor = mostCommonHex(normalCells.map((cell) => cell.hex));
    confirmedCheckpointCells = [];

    candidateCells.forEach((cell) => {
      if (isDarkerVariant(cell.hex, baseColor)) {
        confirmedCheckpointCells.push(cell);
      } else {
        demotedCells.push(cell);
      }
    });
  } else {
    baseColor = lightenColor(
      mostCommonHex(candidateCells.map((cell) => cell.hex)),
      CHECKPOINT_DARKEN_AMOUNT
    );
    confirmedCheckpointCells = candidateCells;
  }

  const rangeDates = [...normalCells, ...demotedCells, ...confirmedCheckpointCells]
    .map((cell) => cell.date)
    .sort();

  const checkpoints: Checkpoint[] = confirmedCheckpointCells
    .map((cell) => ({ id: crypto.randomUUID(), date: cell.date, label: cell.label }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    startDate: rangeDates[0],
    endDate: rangeDates[rangeDates.length - 1],
    color: baseColor,
    checkpoints,
  };
}

type ParsedRow = {
  id: string;
  existingId: string | null;
  name: string;
  memo: string;
  parentId: string | null;
  order: number;
  startDate: string | null;
  endDate: string | null;
  color: string | null;
  checkpoints: Checkpoint[];
};

export async function parseExcelToProject(
  fileData: ArrayBuffer,
  currentProject: Project
): Promise<Project> {
  if (fileData.byteLength > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new ExcelImportError(
      "파일 크기가 너무 큽니다. 50MB 이하의 Excel 파일을 사용해주세요."
    );
  }

  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(fileData);
  } catch {
    throw new ExcelImportError(
      "Excel 파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다."
    );
  }

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new ExcelImportError(
      "Timeline Workspace에서 내보낸 파일인지 확인해주세요."
    );
  }

  const dateColumnMap = buildDateColumnMap(sheet);

  if (dateColumnMap.size === 0) {
    throw new ExcelImportError(
      "이 파일에서 날짜 표를 찾을 수 없습니다. Timeline Workspace에서 내보낸 파일인지 확인해주세요."
    );
  }

  const sortedDateColumns = Array.from(dateColumnMap.keys()).sort((a, b) => a - b);
  const maxCol = sheet.columnCount;

  const idColumnIndex = findColumnByHeaderLabel(
    sheet,
    MONTH_HEADER_ROW_INDEX,
    DISPLAY_SHEET_ID_COLUMN_HEADER_LABEL,
    maxCol
  );
  const memoColumnIndex =
    findColumnByHeaderLabel(
      sheet,
      MONTH_HEADER_ROW_INDEX,
      DISPLAY_SHEET_MEMO_HEADER_LABEL,
      maxCol
    ) ?? sortedDateColumns[0] - 1;

  const parsedRows: ParsedRow[] = [];
  const seenIds = new Set<string>();
  const lastIdAtDepth = new Map<number, string>();
  const orderCounterByParentId = new Map<string | null, number>();

  for (let row = DISPLAY_SHEET_FIRST_DATA_ROW_INDEX; row <= sheet.rowCount; row++) {
    const detected = detectOwnDepthAndName(sheet, row, memoColumnIndex);

    if (!detected) continue;

    const { depth, name } = detected;

    if (parsedRows.length >= MAX_IMPORT_WORK_ITEMS) {
      throw new ExcelImportError(
        `가져올 수 있는 업무 수를 초과했습니다. 최대 ${MAX_IMPORT_WORK_ITEMS.toLocaleString()}개까지 불러올 수 있습니다.`
      );
    }

    const idCellValue = idColumnIndex
      ? cellToString(sheet.getCell(row, idColumnIndex).value)
      : "";
    // A duplicate hidden id (e.g. a user copy-pasted a whole row block) is
    // treated as a fresh row rather than dropped — the row is real, visible
    // content the user typed, and silently discarding it would be far more
    // surprising than just not matching it back to its old counterpart.
    const id = idCellValue && !seenIds.has(idCellValue) ? idCellValue : crypto.randomUUID();

    seenIds.add(id);

    const parentId = depth === 0 ? null : lastIdAtDepth.get(depth - 1) ?? null;
    const nextOrder = (orderCounterByParentId.get(parentId) ?? 0) + DEFAULT_ORDER_STEP;

    orderCounterByParentId.set(parentId, nextOrder);
    lastIdAtDepth.set(depth, id);

    const memo = cellToString(sheet.getCell(row, memoColumnIndex).value);
    const { startDate, endDate, color, checkpoints } = classifyRowCells(
      scanRowFilledCells(sheet, row, sortedDateColumns, dateColumnMap)
    );

    parsedRows.push({
      id,
      existingId: idCellValue || null,
      name,
      memo,
      parentId,
      order: nextOrder,
      startDate,
      endDate,
      color,
      checkpoints,
    });
  }

  if (parsedRows.length === 0) {
    throw new ExcelImportError("가져올 Work Item이 없습니다.");
  }

  const currentItemsById = new Map(currentProject.workItems.map((item) => [item.id, item]));

  const workItems: WorkItem[] = parsedRows.map((row) => {
    const existing = row.existingId ? currentItemsById.get(row.existingId) : undefined;
    // `하위 일정 자동 반영`/`일정 미정` items render a bar that isn't their
    // own real color/dates (a children-color blend, or the full project
    // range) — see plan section 2, point 3 — so those two states, and
    // whatever dates/color/checkpoints go with them, only ever carry over
    // from a matched existing item, never get (re-)derived from the cells.
    const preserveDerivedState = Boolean(existing?.autoTimeline || existing?.isUndecided);

    return normalizeWorkItem({
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      order: row.order,
      startDate: preserveDerivedState ? existing!.startDate : row.startDate,
      endDate: preserveDerivedState ? existing!.endDate : row.endDate,
      autoTimeline: existing?.autoTimeline ?? false,
      isUndecided: existing?.isUndecided ?? false,
      active: true,
      color: preserveDerivedState ? existing!.color : row.color,
      memo: row.memo,
      autoMemoNote: existing?.autoMemoNote ?? null,
      checkpoints: preserveDerivedState
        ? existing!.checkpoints
        : clampCheckpointsToRange(row.checkpoints, row.startDate, row.endDate),
    });
  });

  // Inactive items (and their whole subtree) never appear as rows in the
  // file at all — filterOutInactiveSubtrees excludes them at export time —
  // so they must never be treated as deleted just because the file doesn't
  // mention them. Carried over untouched, outside the diff entirely.
  const inactiveIds = getInactiveSubtreeIds(currentProject.workItems);
  const preservedInactiveItems = currentProject.workItems.filter((item) =>
    inactiveIds.has(item.id)
  );

  const allDates = Array.from(dateColumnMap.values()).sort();
  const timelineStart = allDates[0];
  const timelineEnd = allDates[allDates.length - 1];
  const timelineRangeCheck = validateTimelineRange(timelineStart, timelineEnd);

  if (!timelineRangeCheck.valid) {
    throw new ExcelImportError(timelineRangeCheck.reason);
  }

  const titleText = cellToString(sheet.getCell(TITLE_ROW_INDEX, 1).value);
  const name = titleText.replace(/ 일정표$/, "").trim() || currentProject.name || "가져온 프로젝트";

  const usedColors = new Set<string>();

  workItems.forEach((item) => {
    if (item.color) usedColors.add(item.color);
  });

  const customColors = Array.from(usedColors).filter(
    (hex) => !DEFAULT_COLOR_PALETTE.includes(hex)
  );

  return {
    id: crypto.randomUUID(),
    name,
    timelineStart,
    timelineEnd,
    workItems: [...workItems, ...preservedInactiveItems],
    customColors,
  };
}

export type ImportDiffEntry = { id: string; name: string };

export type ImportDiff = {
  workItems: {
    added: ImportDiffEntry[];
    modified: ImportDiffEntry[];
    deleted: ImportDiffEntry[];
  };
  checkpoints: {
    added: ImportDiffEntry[];
    modified: ImportDiffEntry[];
    deleted: ImportDiffEntry[];
  };
};

function areWorkItemsEqual(a: WorkItem, b: WorkItem): boolean {
  return (
    a.name === b.name &&
    a.parentId === b.parentId &&
    a.order === b.order &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.color === b.color &&
    a.memo === b.memo &&
    a.active === b.active &&
    a.autoTimeline === b.autoTimeline &&
    a.isUndecided === b.isUndecided
  );
}

function checkpointsSignature(checkpoints: Checkpoint[]): string {
  return checkpoints
    .map((checkpoint) => `${checkpoint.date}|${checkpoint.label}`)
    .sort()
    .join(",");
}

/**
 * Compares the currently-open project against a freshly-parsed import, by
 * id, so the "덮어쓰기" confirmation can show exactly what will be
 * added/changed/removed instead of silently replacing everything.
 *
 * Checkpoints have no stable cross-import identity in the visual-parsing
 * model (re-scanning a row's cells can't tell "this checkpoint moved" from
 * "this checkpoint was deleted and a new one added elsewhere") — see plan
 * section 4 — so they're summarized per Work Item ("checkpoint makeup
 * changed") rather than diffed individually the way Work Items are.
 */
export function computeImportDiff(current: Project, incoming: Project): ImportDiff {
  const currentItemsById = new Map(current.workItems.map((item) => [item.id, item]));
  const incomingItemsById = new Map(incoming.workItems.map((item) => [item.id, item]));

  const workItems: ImportDiff["workItems"] = { added: [], modified: [], deleted: [] };
  const checkpoints: ImportDiff["checkpoints"] = { added: [], modified: [], deleted: [] };

  incoming.workItems.forEach((item) => {
    const existing = currentItemsById.get(item.id);

    if (!existing) {
      workItems.added.push({ id: item.id, name: item.name });

      if (item.checkpoints.length > 0) {
        checkpoints.added.push({
          id: item.id,
          name: `${item.name} (체크포인트 ${item.checkpoints.length}개)`,
        });
      }

      return;
    }

    if (!areWorkItemsEqual(existing, item)) {
      workItems.modified.push({ id: item.id, name: item.name });
    }

    if (checkpointsSignature(existing.checkpoints) !== checkpointsSignature(item.checkpoints)) {
      checkpoints.modified.push({ id: item.id, name: item.name });
    }
  });

  current.workItems.forEach((item) => {
    if (!incomingItemsById.has(item.id)) {
      workItems.deleted.push({ id: item.id, name: item.name });
    }
  });

  return { workItems, checkpoints };
}
