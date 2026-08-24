import { NextResponse } from "next/server";
import { generateStructuredContent } from "@/lib/ai/gemini-client";
import { buildScheduleFillPrompt, SCHEDULE_FILL_SYSTEM_INSTRUCTION } from "@/lib/ai/prompts";
import { CONDITION_NOTE_MAX_LENGTH } from "@/lib/ai/build-payload";
import {
  scheduleSuggestionJsonSchema,
  type FillScheduleRequestBody,
  type AiWorkItemInput,
} from "@/lib/ai/schemas";

const MAX_WORK_ITEMS = 500;

// Beta: no per-project rate limit yet. When one is added (e.g. N requests
// per project per day), this is the place to check it before calling Gemini.
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { errorCode: "invalid_request", message: "요청 본문을 해석하지 못했습니다." },
      { status: 400 }
    );
  }

  const parsed = parseRequestBody(body);

  if (!parsed.ok) {
    return NextResponse.json(
      { errorCode: "invalid_request", message: parsed.message },
      { status: 400 }
    );
  }

  const prompt = buildScheduleFillPrompt(parsed.value);

  const result = await generateStructuredContent({
    systemInstruction: SCHEDULE_FILL_SYSTEM_INSTRUCTION,
    prompt,
    responseJsonSchema: scheduleSuggestionJsonSchema,
  });

  if (!result.ok) {
    return NextResponse.json(
      { errorCode: result.errorCode, message: result.message },
      { status: statusForErrorCode(result.errorCode) }
    );
  }

  return NextResponse.json(result.data);
}

function parseRequestBody(
  body: unknown
): { ok: true; value: FillScheduleRequestBody } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  }

  const { timelineStart, timelineEnd, workItems, projectConditionNote } =
    body as Record<string, unknown>;

  if (typeof timelineStart !== "string" || typeof timelineEnd !== "string") {
    return { ok: false, message: "프로젝트 기간 정보가 없습니다." };
  }

  if (projectConditionNote !== undefined && typeof projectConditionNote !== "string") {
    return { ok: false, message: "프로젝트 조건 형식이 올바르지 않습니다." };
  }

  if (!Array.isArray(workItems)) {
    return { ok: false, message: "Work Item 목록이 없습니다." };
  }

  if (workItems.length === 0) {
    return { ok: false, message: "Work Item이 없습니다." };
  }

  if (workItems.length > MAX_WORK_ITEMS) {
    return { ok: false, message: "Work Item 수가 너무 많습니다." };
  }

  const validatedItems: AiWorkItemInput[] = [];

  for (const raw of workItems) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, message: "Work Item 형식이 올바르지 않습니다." };
    }

    const item = raw as Record<string, unknown>;

    if (
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      (item.parentId !== null && typeof item.parentId !== "string") ||
      typeof item.order !== "number" ||
      (item.startDate !== null && typeof item.startDate !== "string") ||
      (item.endDate !== null && typeof item.endDate !== "string") ||
      typeof item.autoTimeline !== "boolean" ||
      typeof item.isUndecided !== "boolean" ||
      typeof item.memo !== "string" ||
      typeof item.targetForSuggestion !== "boolean"
    ) {
      return { ok: false, message: "Work Item 형식이 올바르지 않습니다." };
    }

    validatedItems.push({
      id: item.id,
      name: item.name,
      parentId: item.parentId as string | null,
      order: item.order,
      startDate: item.startDate as string | null,
      endDate: item.endDate as string | null,
      autoTimeline: item.autoTimeline,
      isUndecided: item.isUndecided,
      memo: item.memo,
      targetForSuggestion: item.targetForSuggestion,
    });
  }

  if (!validatedItems.some((item) => item.targetForSuggestion)) {
    return { ok: false, message: "AI에게 일정 제안을 요청할 대상으로 선택된 업무가 없습니다." };
  }

  return {
    ok: true,
    value: {
      timelineStart,
      timelineEnd,
      workItems: validatedItems,
      projectConditionNote:
        typeof projectConditionNote === "string"
          ? projectConditionNote.trim().slice(0, CONDITION_NOTE_MAX_LENGTH)
          : "",
    },
  };
}

function statusForErrorCode(errorCode: string): number {
  switch (errorCode) {
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "missing_api_key":
      return 500;
    default:
      return 502;
  }
}
