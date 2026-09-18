import { NextResponse } from "next/server";
import { generateStructuredContent } from "@/lib/ai/gemini-client";
import {
  buildWorkStructurePrompt,
  WORK_STRUCTURE_FREEFORM_SYSTEM_INSTRUCTION,
  WORK_STRUCTURE_SYSTEM_INSTRUCTION,
} from "@/lib/ai/prompts";
import {
  NAME_MAX_LENGTH,
  REQUIRED_TASKS_MAX_COUNT,
  REQUIRED_TASK_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from "@/lib/ai/build-payload";
import { isRateLimited, isRequestTooLarge } from "@/lib/ai/api-guard";
import { workStructureJsonSchema, type WorkStructureRequestBody } from "@/lib/ai/schemas";

const MAX_EXISTING_NAMES = 300;
const GRANULARITY_VALUES = [1, 2, 3, 4, 5] as const;

// Give Gemini room to respond before Vercel kills the function — must stay
// above gemini-client's own REQUEST_TIMEOUT_MS or that timeout never gets
// the chance to return its (nicer) error response.
export const maxDuration = 60;

export async function POST(request: Request) {
  if (isRateLimited(request, "build-structure")) {
    return NextResponse.json(
      { errorCode: "rate_limited", message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  if (isRequestTooLarge(request)) {
    return NextResponse.json(
      { errorCode: "invalid_request", message: "요청 본문이 너무 큽니다." },
      { status: 413 }
    );
  }

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

  const prompt = buildWorkStructurePrompt(parsed.value);
  // requiredTasks is optional — an empty list falls back to the original
  // freeform prompt (AI infers tasks from projectTopic alone) instead of the
  // required-task-structuring one, which has nothing to structure otherwise.
  const systemInstruction =
    parsed.value.requiredTasks.length > 0
      ? WORK_STRUCTURE_SYSTEM_INSTRUCTION
      : WORK_STRUCTURE_FREEFORM_SYSTEM_INSTRUCTION;

  const result = await generateStructuredContent({
    systemInstruction,
    prompt,
    responseJsonSchema: workStructureJsonSchema,
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
): { ok: true; value: WorkStructureRequestBody } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  }

  const { projectTopic, requiredTasks, granularity, existingWorkItemNames } =
    body as Record<string, unknown>;

  if (typeof projectTopic !== "string" || projectTopic.trim().length === 0) {
    return { ok: false, message: "프로젝트 주제가 없습니다." };
  }

  if (projectTopic.length > TOPIC_MAX_LENGTH) {
    return { ok: false, message: "프로젝트 주제가 너무 깁니다." };
  }

  if (!Array.isArray(requiredTasks)) {
    return { ok: false, message: "필수 과업 형식이 올바르지 않습니다." };
  }

  if (requiredTasks.length > REQUIRED_TASKS_MAX_COUNT) {
    return { ok: false, message: "필수 과업 수가 너무 많습니다." };
  }

  const validatedRequiredTasks: string[] = [];

  for (const raw of requiredTasks) {
    if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > REQUIRED_TASK_MAX_LENGTH) {
      return { ok: false, message: "필수 과업 형식이 올바르지 않습니다." };
    }

    validatedRequiredTasks.push(raw.trim());
  }

  if (
    typeof granularity !== "number" ||
    !GRANULARITY_VALUES.includes(granularity as (typeof GRANULARITY_VALUES)[number])
  ) {
    return { ok: false, message: "업무 세분도 값이 올바르지 않습니다." };
  }

  if (!Array.isArray(existingWorkItemNames)) {
    return { ok: false, message: "기존 업무 이름 목록 형식이 올바르지 않습니다." };
  }

  if (existingWorkItemNames.length > MAX_EXISTING_NAMES) {
    return { ok: false, message: "기존 업무 이름 목록이 너무 많습니다." };
  }

  const validatedNames: string[] = [];

  for (const raw of existingWorkItemNames) {
    if (typeof raw !== "string" || raw.length > NAME_MAX_LENGTH) {
      return { ok: false, message: "기존 업무 이름 형식이 올바르지 않습니다." };
    }

    validatedNames.push(raw);
  }

  return {
    ok: true,
    value: {
      projectTopic: projectTopic.trim(),
      requiredTasks: validatedRequiredTasks,
      granularity: granularity as WorkStructureRequestBody["granularity"],
      existingWorkItemNames: validatedNames,
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
