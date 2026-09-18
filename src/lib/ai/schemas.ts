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

// AI 업무 구조 만들기 (work structure builder) — takes the user's own list of
// required tasks/work areas and structures them into a task tree (grouping
// semantically related items, merging duplicates, decomposing into detail
// work as needed). Entirely separate from fill-schedule (which only ever
// assigns dates to existing items). The AI never sees or touches item
// ids/dates/memos here; it only proposes name + children, plus a
// requiredTaskCoverage self-report used for the preservation check below.
export type WorkStructureRequestBody = {
  projectTopic: string;
  /** User-listed required tasks/work areas — the AI must not drop or ignore any of these (see prompts.ts). */
  requiredTasks: string[];
  granularity: 1 | 2 | 3 | 4 | 5;
  /** Existing Work Item names only (no ids/dates/memo), so the AI can avoid re-proposing what already exists. */
  existingWorkItemNames: string[];
};

export type WorkStructureNode = {
  name: string;
  children: WorkStructureNode[];
};

// The AI's own claim of which output node represents which input required
// task. Never trusted on its own — validate-work-structure.ts cross-checks
// representedAsNodeName against the actual (post-hardcap) tree before
// accepting it, and falls back to exact-string presence otherwise.
export type RequiredTaskCoverageEntry = {
  requiredTask: string;
  representedAsNodeName: string;
};

export type WorkStructureResponseBody = {
  items: WorkStructureNode[];
  totalCount: number;
  notes: string[];
  requiredTaskCoverage: RequiredTaskCoverageEntry[];
};

// Root counts as depth 1. Kept in sync with the explicitly-nested (not
// recursive $ref) JSON schema below, since Gemini's structured-output
// support for self-referential schemas isn't reliable.
export const WORK_STRUCTURE_MAX_DEPTH = 4;
export const WORK_STRUCTURE_MAX_TOTAL_NODES = 60;

const workStructureLeafSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
  },
  required: ["name"],
} as const;

const workStructureLevel3Schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    children: { type: "array", items: workStructureLeafSchema },
  },
  required: ["name", "children"],
} as const;

const workStructureLevel2Schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    children: { type: "array", items: workStructureLevel3Schema },
  },
  required: ["name", "children"],
} as const;

const workStructureLevel1Schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    children: { type: "array", items: workStructureLevel2Schema },
  },
  required: ["name", "children"],
} as const;

const requiredTaskCoverageEntrySchema = {
  type: "object",
  properties: {
    requiredTask: { type: "string", description: "입력받은 requiredTasks 항목 문자열 그대로" },
    representedAsNodeName: {
      type: "string",
      description: "이 필수 과업을 대표하는 items 트리 내 노드의 name (어느 깊이든 무방)",
    },
  },
  required: ["requiredTask", "representedAsNodeName"],
} as const;

export const workStructureJsonSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "프로젝트 최상위 업무 목록 (최대 4단계 깊이)",
      items: workStructureLevel1Schema,
    },
    totalCount: {
      type: "number",
      description: "items에 포함된 전체 업무(하위 포함) 개수",
    },
    notes: {
      type: "array",
      description: "업무 구성 근거나 참고사항 (선택, 없으면 빈 배열)",
      items: { type: "string" },
    },
    requiredTaskCoverage: {
      type: "array",
      description:
        "requiredTasks의 각 항목마다 정확히 하나씩, 그 항목을 items 트리의 어떤 노드로 표현했는지 선언",
      items: requiredTaskCoverageEntrySchema,
    },
  },
  required: ["items", "totalCount", "notes", "requiredTaskCoverage"],
} as const;
