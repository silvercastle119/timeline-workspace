import ExcelJS from "exceljs";
import { normalizeWorkItem } from "@/lib/work-items/tree-utils";
import type { Project, WorkItem } from "@/types/project";
import {
  METADATA_HEADER,
  METADATA_SHEET_NAME,
  PROJECT_SHEET_NAME,
} from "@/lib/export/excel-export";

export class ExcelImportError extends Error {}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text ?? "");
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  return String(value);
}

function cellToBoolean(value: ExcelJS.CellValue): boolean {
  if (typeof value === "boolean") return value;

  return cellToString(value).trim().toLowerCase() === "true";
}

export async function parseExcelToProject(
  fileData: ArrayBuffer
): Promise<Project> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileData);

  const projectSheet = workbook.getWorksheet(PROJECT_SHEET_NAME);
  const metadataSheet = workbook.getWorksheet(METADATA_SHEET_NAME);

  if (!projectSheet || !metadataSheet) {
    throw new ExcelImportError(
      "이 Excel 파일에는 가져오기에 필요한 메타데이터가 없습니다. Timeline Workspace에서 내보낸 파일만 가져올 수 있습니다."
    );
  }

  const projectFields = new Map<string, string>();

  projectSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const key = cellToString(row.getCell(1).value);
    const value = cellToString(row.getCell(2).value);

    if (key) projectFields.set(key, value);
  });

  const headerRow = metadataSheet.getRow(1);
  const columnIndexByField = new Map<string, number>();

  headerRow.eachCell((cell, colNumber) => {
    const field = cellToString(cell.value);
    if (field) columnIndexByField.set(field, colNumber);
  });

  const missingColumns = METADATA_HEADER.filter(
    (field) => !columnIndexByField.has(field)
  );

  if (missingColumns.length > 0) {
    throw new ExcelImportError(
      "메타데이터 시트 형식이 올바르지 않습니다. Timeline Workspace에서 내보낸 파일인지 확인해주세요."
    );
  }

  const getField = (
    row: ExcelJS.Row,
    field: (typeof METADATA_HEADER)[number]
  ) => row.getCell(columnIndexByField.get(field)!).value;

  const workItems: WorkItem[] = [];

  metadataSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const id = cellToString(getField(row, "id"));
    if (!id) return;

    const parentIdRaw = cellToString(getField(row, "parentId"));
    const startDateRaw = cellToString(getField(row, "startDate"));
    const endDateRaw = cellToString(getField(row, "endDate"));
    const colorRaw = cellToString(getField(row, "color"));
    const autoMemoNoteRaw = cellToString(getField(row, "autoMemoNote"));
    const orderRaw = getField(row, "order");

    workItems.push(
      normalizeWorkItem({
        id,
        name: cellToString(getField(row, "name")),
        parentId: parentIdRaw || null,
        order:
          typeof orderRaw === "number" ? orderRaw : Number(orderRaw) || 0,
        startDate: startDateRaw || null,
        endDate: endDateRaw || null,
        autoTimeline: cellToBoolean(getField(row, "autoTimeline")),
        isUndecided: cellToBoolean(getField(row, "isUndecided")),
        active: cellToBoolean(getField(row, "active")),
        color: colorRaw || null,
        memo: cellToString(getField(row, "memo")),
        autoMemoNote: autoMemoNoteRaw || null,
      })
    );
  });

  if (workItems.length === 0) {
    throw new ExcelImportError("가져올 Work Item이 없습니다.");
  }

  const customColorsRaw = projectFields.get("customColors") ?? "";

  return {
    id: projectFields.get("id") || crypto.randomUUID(),
    name: projectFields.get("name") || "가져온 프로젝트",
    timelineStart: projectFields.get("timelineStart") || "",
    timelineEnd: projectFields.get("timelineEnd") || "",
    workItems,
    customColors: customColorsRaw
      ? customColorsRaw.split(",").filter(Boolean)
      : [],
  };
}
