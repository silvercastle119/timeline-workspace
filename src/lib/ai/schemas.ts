// Shared request/response shapes for the Gemini-backed AI beta features.
// These types and JSON Schemas are used both by the server route handlers
// (to configure Gemini's structured output) and by the client-side
// validators, so the two stay in sync by construction.

export type AiWorkItemInput = {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  startDate: string | null;
  endDate: string | null;
  autoTimeline: boolean;
  isUndecided: boolean;
  memo: string;
  /**
   * User-selected in the AI panel's checklist step for this request only —
   * NOT a stored WorkItem field. True = user explicitly allowed the AI to
   * propose/overwrite this item's dates in this run. False = context only;
   * the AI must not propose a date for it even if it looks undecided.
   */
  targetForSuggestion: boolean;
};

export type FillScheduleRequestBody = {
  timelineStart: string;
  timelineEnd: string;
  workItems: AiWorkItemInput[];
  /**
   * Free-text project-wide condition note (참여 인원, 복잡도, 작업 중단 기간
   * 등) typed once by the user for this single draft request. Not stored
   * anywhere — applies only to this one Gemini call, never persisted.
   */
  projectConditionNote: string;
};

export type ScheduleSuggestion = {
  id: string;
  startDate: string;
  endDate: string;
};

export type FillScheduleResponseBody = {
  suggestions: ScheduleSuggestion[];
  notes: string[];
};

export const scheduleSuggestionJsonSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      description:
        "targetForSuggestion이 true인 업무에 대해서만 제안한다. false인 업무는 절대 포함하지 않는다.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "제안 대상 Work Item의 기존 id" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["id", "startDate", "endDate"],
      },
    },
    notes: {
      type: "array",
      description: "일정 판단 근거나 참고사항 (선택, 없으면 빈 배열)",
      items: { type: "string" },
    },
  },
  required: ["suggestions", "notes"],
} as const;

export type AiReviewWorkItemInput = {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  startDate: string | null;
  endDate: string | null;
  isUndecided: boolean;
  memo: string;
};

export type ReviewProjectRequestBody = {
  timelineStart: string;
  timelineEnd: string;
  workItems: AiReviewWorkItemInput[];
};

export const REVIEW_SEVERITIES = ["확인 필요", "주의", "참고"] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export type ReviewIssue = {
  severity: ReviewSeverity;
  workItemId: string;
  title: string;
  description: string;
};

export type ReviewProjectResponseBody = {
  issues: ReviewIssue[];
};

export const reviewIssueJsonSchema = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: [...REVIEW_SEVERITIES],
            description:
              "확정적 오류 판정이 아니라 사람이 확인해볼 만한 수준을 나타낸다.",
          },
          workItemId: {
            type: "string",
            description:
              "관련된 Work Item의 id. 특정 항목과 관련 없는 전체 프로젝트 관찰이면 빈 문자열(\"\")로 둔다.",
          },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["severity", "workItemId", "title", "description"],
      },
    },
  },
  required: ["issues"],
} as const;
