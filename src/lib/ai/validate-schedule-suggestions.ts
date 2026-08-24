import { isValidDateString, validateTimelineRange } from "@/lib/timeline/timeline-validation";
import type { Project, WorkItem } from "@/types/project";

export type ApplicableSuggestion = {
  id: string;
  itemName: string;
  startDate: string;
  endDate: string;
};

export type FlaggedSuggestion = {
  id: string;
  itemName: string | null;
  reason: string;
};

export type ValidatedScheduleSuggestions = {
  applicable: ApplicableSuggestion[];
  flagged: FlaggedSuggestion[];
  notes: string[];
};

/**
 * Never trusts the raw Gemini response. Every suggestion is independently
 * re-checked against the *original* project snapshot passed in — a
 * suggestion that fails any rule is moved to `flagged` with a reason instead
 * of silently dropped or blindly applied, and one bad suggestion never
 * invalidates the rest.
 */
export function validateScheduleSuggestions(
  project: Project,
  targetIds: Set<string>,
  rawResponse: unknown
): ValidatedScheduleSuggestions {
  const notes = extractNotes(rawResponse);
  const rawSuggestions = extractSuggestions(rawResponse);
  const itemsById = new Map(project.workItems.map((item) => [item.id, item]));

  const applicable: ApplicableSuggestion[] = [];
  const flagged: FlaggedSuggestion[] = [];
  const seenIds = new Set<string>();

  for (const raw of rawSuggestions) {
    const result = validateOne(raw, project, targetIds, itemsById, seenIds);

    if (result.ok) {
      applicable.push(result.value);
      seenIds.add(result.value.id);
    } else {
      flagged.push(result.value);
    }
  }

  return { applicable, flagged, notes };
}

type RawSuggestion = { id: unknown; startDate: unknown; endDate: unknown };

function validateOne(
  raw: RawSuggestion,
  project: Project,
  targetIds: Set<string>,
  itemsById: Map<string, WorkItem>,
  seenIds: Set<string>
): { ok: true; value: ApplicableSuggestion } | { ok: false; value: FlaggedSuggestion } {
  const id = typeof raw.id === "string" ? raw.id : null;

  // 1) id가 실제로 존재하는가 (동시에 존재하지 않는 id로 새 항목을 만들려는 시도 차단)
  const item = id ? itemsById.get(id) : undefined;

  if (!id || !item) {
    return {
      ok: false,
      value: { id: id ?? "?", itemName: null, reason: "존재하지 않는 Work Item id입니다." },
    };
  }

  // 같은 id에 대한 중복 제안은 첫 번째만 인정
  if (seenIds.has(id)) {
    return {
      ok: false,
      value: { id, itemName: item.name, reason: "동일 항목에 대한 중복 제안입니다." },
    };
  }

  // name/parentId/order는 스키마 자체에 없어 AI가 변경할 방법이 없음 — 응답에 포함돼도 항상 무시.

  // 2) autoTimeline 항목은 파생 값이므로 직접 제안 대상이 아님
  if (item.autoTimeline) {
    return {
      ok: false,
      value: {
        id,
        itemName: item.name,
        reason: "하위 일정 자동 반영 항목은 직접 일정을 지정할 수 없습니다.",
      },
    };
  }

  // 3) 사용자가 이번 요청에서 AI 대상으로 직접 선택한 항목만 변경 가능 —
  // 요청 시점 스냅샷(targetIds)과 대조하므로 응답 자체의 값은 신뢰하지 않음.
  if (!targetIds.has(id)) {
    return {
      ok: false,
      value: { id, itemName: item.name, reason: "AI 제안 대상으로 선택하지 않은 항목입니다." },
    };
  }

  const startDate = typeof raw.startDate === "string" ? raw.startDate : null;
  const endDate = typeof raw.endDate === "string" ? raw.endDate : null;

  // 4) 날짜 형식 검증
  if (!startDate || !endDate || !isValidDateString(startDate) || !isValidDateString(endDate)) {
    return {
      ok: false,
      value: { id, itemName: item.name, reason: "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)" },
    };
  }

  // 5) startDate <= endDate
  const rangeCheck = validateTimelineRange(startDate, endDate);

  if (!rangeCheck.valid) {
    return { ok: false, value: { id, itemName: item.name, reason: rangeCheck.reason } };
  }

  // 6) 프로젝트 전체 기간을 벗어나지 않는가
  if (startDate < project.timelineStart || endDate > project.timelineEnd) {
    return {
      ok: false,
      value: { id, itemName: item.name, reason: "프로젝트 전체 기간을 벗어난 일정입니다." },
    };
  }

  return { ok: true, value: { id, itemName: item.name, startDate, endDate } };
}

function extractSuggestions(rawResponse: unknown): RawSuggestion[] {
  if (typeof rawResponse !== "object" || rawResponse === null) return [];

  const suggestions = (rawResponse as Record<string, unknown>).suggestions;

  if (!Array.isArray(suggestions)) return [];

  return suggestions.filter(
    (item): item is RawSuggestion => typeof item === "object" && item !== null
  );
}

function extractNotes(rawResponse: unknown): string[] {
  if (typeof rawResponse !== "object" || rawResponse === null) return [];

  const notes = (rawResponse as Record<string, unknown>).notes;

  if (!Array.isArray(notes)) return [];

  return notes.filter((note): note is string => typeof note === "string");
}
