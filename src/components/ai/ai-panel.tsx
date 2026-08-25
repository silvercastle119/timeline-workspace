"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, WorkItem } from "@/types/project";
import type { WorkItemDisplayRow } from "@/lib/work-items/tree-utils";
import {
  buildFillScheduleRequest,
  buildProjectReviewRequest,
  getDefaultScheduleTargetIds,
  getScheduleChecklistRows,
  CONDITION_NOTE_MAX_LENGTH,
} from "@/lib/ai/build-payload";
import {
  validateScheduleSuggestions,
  type ValidatedScheduleSuggestions,
} from "@/lib/ai/validate-schedule-suggestions";
import {
  validateReviewIssues,
  type ValidatedReviewIssue,
} from "@/lib/ai/validate-review-issues";
import { trackEvent } from "@/lib/analytics";

type AiView = "menu" | "fill-schedule" | "review";

type ScheduleStep = "select" | "loading" | "error" | "result";
type ReviewRunStatus = "idle" | "loading" | "error";

type ReviewHistoryEntry = {
  ranAt: number;
  issues: ValidatedReviewIssue[];
};

const PANEL_CLOSE_ANIMATION_MS = 180;
const REVIEW_HISTORY_LIMIT = 10;

const SEVERITY_BADGE_CLASS: Record<string, string> = {
  "확인 필요": "bg-amber-100 text-amber-700",
  "주의": "bg-blue-100 text-blue-700",
  "참고": "bg-zinc-100 text-zinc-600",
};

type AiPanelProps = {
  project: Project;
  updateWorkItems: (updater: (items: WorkItem[]) => WorkItem[]) => void;
  onJumpToWorkItem: (id: string) => void;
  isDetailPanelOpen: boolean;
  // Called once when the panel is closed after at least one successful AI
  // run (schedule fill or review) happened during this open session — never
  // for a panel opened-then-closed with no run, or one that only failed.
  onSignificantSuccess: () => void;
};

export function AiPanel({
  project,
  updateWorkItems,
  onJumpToWorkItem,
  isDetailPanelOpen,
  onSignificantSuccess,
}: AiPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [view, setView] = useState<AiView>("menu");

  const [scheduleStep, setScheduleStep] = useState<ScheduleStep>("select");
  const [scheduleTargetIds, setScheduleTargetIds] = useState<Set<string>>(new Set());
  const [scheduleConditionNote, setScheduleConditionNote] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleResult, setScheduleResult] = useState<ValidatedScheduleSuggestions | null>(null);

  const [reviewStatus, setReviewStatus] = useState<ReviewRunStatus>("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Kept across panel close/reopen (in-memory only, never persisted) so past
  // review runs stay visible until the page itself reloads.
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryEntry[]>([]);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set on a successful schedule-fill or review run, consumed (and reset)
  // the next time the panel actually closes — see closePanel().
  const pendingSuccessRef = useRef(false);

  const resetFeatureState = () => {
    setView("menu");
    setScheduleStep("select");
    setScheduleTargetIds(new Set());
    setScheduleConditionNote("");
    setScheduleError(null);
    setScheduleResult(null);
    setReviewStatus("idle");
    setReviewError(null);
  };

  const openPanel = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (!isOpen) {
      trackEvent({ eventType: "ai_panel_open", projectId: project.id });
    }

    setIsClosing(false);
    setIsOpen(true);
  };

  const closePanel = useCallback(() => {
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimeoutRef.current = null;
      resetFeatureState();

      if (pendingSuccessRef.current) {
        pendingSuccessRef.current = false;
        onSignificantSuccess();
      }
    }, PANEL_CLOSE_ANIMATION_MS);
  }, [onSignificantSuccess]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closePanel]);

  const openFillSchedule = () => {
    setView("fill-schedule");
    setScheduleTargetIds(getDefaultScheduleTargetIds(project));
    setScheduleConditionNote("");
    setScheduleStep("select");
    setScheduleError(null);
    setScheduleResult(null);
  };

  const toggleScheduleTarget = (itemId: string) => {
    setScheduleTargetIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAllScheduleTargets = () => {
    setScheduleTargetIds(getDefaultScheduleTargetIds(project));
  };

  const deselectAllScheduleTargets = () => {
    setScheduleTargetIds(new Set());
  };

  const submitFillSchedule = async () => {
    if (scheduleTargetIds.size === 0) return;

    const targetIds = scheduleTargetIds;
    const payload = buildFillScheduleRequest(project, targetIds, scheduleConditionNote);

    setScheduleStep("loading");
    setScheduleError(null);

    try {
      const response = await fetch("/api/ai/fill-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        setScheduleStep("error");
        setScheduleError(friendlyErrorMessage(json?.errorCode));
        trackEvent({ eventType: "ai_schedule_fail", projectId: project.id });
        return;
      }

      const validated = validateScheduleSuggestions(project, targetIds, json);

      if (validated.applicable.length === 0 && validated.flagged.length === 0) {
        setScheduleStep("error");
        setScheduleError("AI가 제안할 수 있는 일정을 찾지 못했습니다.");
        trackEvent({ eventType: "ai_schedule_fail", projectId: project.id });
        return;
      }

      setScheduleResult(validated);
      setScheduleStep("result");
      trackEvent({ eventType: "ai_schedule", projectId: project.id });
      pendingSuccessRef.current = true;
    } catch {
      setScheduleStep("error");
      setScheduleError("AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
      trackEvent({ eventType: "ai_schedule_fail", projectId: project.id });
    }
  };

  const applyScheduleSuggestions = () => {
    if (!scheduleResult || scheduleResult.applicable.length === 0) return;

    const suggestionsById = new Map(scheduleResult.applicable.map((s) => [s.id, s]));

    updateWorkItems((items) =>
      items.map((item) => {
        const suggestion = suggestionsById.get(item.id);

        if (!suggestion) return item;

        return {
          ...item,
          startDate: suggestion.startDate,
          endDate: suggestion.endDate,
          isUndecided: false,
        };
      })
    );

    closePanel();
  };

  const openReview = () => {
    setView("review");
    // Only auto-run the very first time — once history exists, reopening the
    // panel just shows past results; re-running is an explicit user action.
    if (reviewHistory.length === 0) runReview();
  };

  const runReview = async () => {
    const payload = buildProjectReviewRequest(project);

    setReviewStatus("loading");
    setReviewError(null);

    try {
      const response = await fetch("/api/ai/review-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        setReviewStatus("error");
        setReviewError(friendlyErrorMessage(json?.errorCode));
        trackEvent({ eventType: "ai_review_fail", projectId: project.id });
        return;
      }

      const validated = validateReviewIssues(project, json);
      setReviewHistory((current) =>
        [{ ranAt: Date.now(), issues: validated }, ...current].slice(0, REVIEW_HISTORY_LIMIT)
      );
      setReviewStatus("idle");
      trackEvent({ eventType: "ai_review", projectId: project.id });
      pendingSuccessRef.current = true;
    } catch {
      setReviewStatus("error");
      setReviewError("AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
      trackEvent({ eventType: "ai_review_fail", projectId: project.id });
    }
  };

  const handleIssueClick = (workItemId: string | null) => {
    if (!workItemId) return;
    closePanel();
    onJumpToWorkItem(workItemId);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label="AI 기능 (베타)"
        className={`fixed bottom-20 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-base font-semibold text-white shadow-lg transition-[right,transform] duration-200 ease-out hover:bg-violet-700 active:scale-90 ${
          isDetailPanelOpen ? "right-[344px]" : "right-6"
        }`}
      >
        ✨
      </button>

      {isOpen && (
        <div
          onClick={closePanel}
          className={`fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 ${
            isClosing
              ? "animate-[guide-backdrop-out_180ms_ease-in_forwards]"
              : "animate-[guide-backdrop-in_180ms_ease-out]"
          }`}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl ${
              isClosing
                ? "animate-[guide-panel-out_180ms_ease-in_forwards]"
                : "animate-[guide-panel-in_220ms_ease-out]"
            }`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-1.5 text-base font-semibold text-zinc-900">
                  ✨ AI 기능
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                    Beta
                  </span>
                </h2>
                <p className="text-xs text-zinc-500">
                  현재 베타 테스트 중인 기능입니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="AI 패널 닫기"
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {view === "menu" && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-relaxed text-zinc-600">
                    TO-DO-LINE의 프로젝트 데이터를 바탕으로 AI의 도움을 받아
                    일정을 작성하고 프로젝트를 검토할 수 있습니다. AI 처리를
                    위해 현재 프로젝트의 업무 구조와 일정 정보가 Google
                    Gemini API로 전송됩니다.
                  </p>

                  <button
                    type="button"
                    onClick={openFillSchedule}
                    className="rounded-lg border border-zinc-200 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/50"
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      AI 일정 채우기
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      직접 선택한 업무에 대해서만 일정을 제안합니다. 선택하지
                      않은 업무는 AI가 변경하지 않습니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={openReview}
                    className="rounded-lg border border-zinc-200 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/50"
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      프로젝트 검토하기
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      완성된 프로젝트 구조와 일정을 AI에게 검토받습니다.
                    </p>
                  </button>
                </div>
              )}

              {view === "fill-schedule" && (
                <FillScheduleView
                  project={project}
                  step={scheduleStep}
                  targetIds={scheduleTargetIds}
                  conditionNote={scheduleConditionNote}
                  error={scheduleError}
                  result={scheduleResult}
                  onToggleTarget={toggleScheduleTarget}
                  onSelectAll={selectAllScheduleTargets}
                  onDeselectAll={deselectAllScheduleTargets}
                  onConditionNoteChange={setScheduleConditionNote}
                  onBack={() => setView("menu")}
                  onBackToSelect={() => setScheduleStep("select")}
                  onSubmit={submitFillSchedule}
                  onApply={applyScheduleSuggestions}
                />
              )}

              {view === "review" && (
                <ReviewView
                  status={reviewStatus}
                  error={reviewError}
                  history={reviewHistory}
                  projectId={project.id}
                  onBack={() => setView("menu")}
                  onRunNew={runReview}
                  onIssueClick={handleIssueClick}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function friendlyErrorMessage(errorCode: unknown): string {
  switch (errorCode) {
    case "rate_limited":
      return "지금 AI 요청이 많습니다. 잠시 후 다시 시도해주세요.";
    case "timeout":
      return "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
    case "invalid_request":
      return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
    case "missing_api_key":
      return "AI 기능이 아직 설정되지 않았습니다. 잠시 후 다시 시도해도 안 되면 관리자에게 문의해주세요.";
    default:
      return "AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
  }
}

function BackButton({ onClick, label = "← 뒤로" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
    >
      {label}
    </button>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-600" />
      AI가 분석하고 있습니다...
    </div>
  );
}

function scheduleStatusLabel(item: WorkItem): string {
  if (item.autoTimeline) return "자동 반영";
  if (item.isUndecided || !item.startDate || !item.endDate) return "미정";
  return `${item.startDate} ~ ${item.endDate}`;
}

type FillScheduleViewProps = {
  project: Project;
  step: ScheduleStep;
  targetIds: Set<string>;
  conditionNote: string;
  error: string | null;
  result: ValidatedScheduleSuggestions | null;
  onToggleTarget: (itemId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConditionNoteChange: (value: string) => void;
  onBack: () => void;
  onBackToSelect: () => void;
  onSubmit: () => void;
  onApply: () => void;
};

function FillScheduleView({
  project,
  step,
  targetIds,
  conditionNote,
  error,
  result,
  onToggleTarget,
  onSelectAll,
  onDeselectAll,
  onConditionNoteChange,
  onBack,
  onBackToSelect,
  onSubmit,
  onApply,
}: FillScheduleViewProps) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <h3 className="mb-1 text-sm font-semibold text-zinc-900">✨ AI 일정 채우기</h3>

      {step === "select" && (
        <ScheduleTargetChecklist
          project={project}
          targetIds={targetIds}
          conditionNote={conditionNote}
          onToggleTarget={onToggleTarget}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onConditionNoteChange={onConditionNoteChange}
          onSubmit={onSubmit}
        />
      )}

      {step === "loading" && <LoadingRow />}

      {step === "error" && (
        <div className="flex flex-col gap-3">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBackToSelect}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              대상 다시 선택
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="flex flex-col gap-4">
          {result.applicable.length > 0 && (
            <div className="flex flex-col gap-2">
              {result.applicable.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2"
                >
                  <span className="text-sm font-medium text-zinc-900">{suggestion.itemName}</span>
                  <span className="text-xs text-zinc-500">
                    {suggestion.startDate} ~ {suggestion.endDate}
                  </span>
                </div>
              ))}
            </div>
          )}

          {result.applicable.length === 0 && (
            <p className="text-sm text-zinc-500">적용 가능한 일정 제안이 없습니다.</p>
          )}

          {result.notes.length > 0 && (
            <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              {result.notes.map((note, index) => (
                <p key={index}>{note}</p>
              ))}
            </div>
          )}

          {result.flagged.length > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <summary className="cursor-pointer font-medium">
                검토가 필요해 제외된 항목 {result.flagged.length}건
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {result.flagged.map((flag, index) => (
                  <li key={index}>
                    {flag.itemName ?? "알 수 없는 항목"}: {flag.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
            <button
              type="button"
              onClick={onBackToSelect}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={result.applicable.length === 0}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              적용하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type ScheduleTargetChecklistProps = {
  project: Project;
  targetIds: Set<string>;
  conditionNote: string;
  onToggleTarget: (itemId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConditionNoteChange: (value: string) => void;
  onSubmit: () => void;
};

function ScheduleTargetChecklist({
  project,
  targetIds,
  conditionNote,
  onToggleTarget,
  onSelectAll,
  onDeselectAll,
  onConditionNoteChange,
  onSubmit,
}: ScheduleTargetChecklistProps) {
  const rows: WorkItemDisplayRow[] = getScheduleChecklistRows(project);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700">
          프로젝트 조건 (선택)
        </label>
        <textarea
          value={conditionNote}
          onChange={(event) => onConditionNoteChange(event.target.value)}
          maxLength={CONDITION_NOTE_MAX_LENGTH}
          rows={2}
          placeholder="예: 4명 참여, 비교적 쉬운 업무, 8월 23일부터 30일까지 작업 중단 등"
          className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          이번 초안 생성 1회에만 적용되며 저장되지 않습니다. 개별 업무의 메모도 함께 참고합니다.
        </p>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        체크된 업무만 AI가 일정을 제안합니다. 이미 일정이 있는 업무도
        체크하면 새 일정으로 덮어쓸 수 있으니, 그대로 유지하고 싶은 업무는
        체크를 해제하세요. (하위 일정 자동 반영 업무는 선택할 수 없습니다.)
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          전체 선택
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          전체 해제
        </button>
      </div>

      <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-zinc-200">
        {rows.map(({ item, depth }) => (
          <label
            key={item.id}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
            className={`flex items-center gap-2.5 border-b border-zinc-100 py-2 pr-3 text-sm last:border-b-0 ${
              item.autoTimeline ? "opacity-50" : "cursor-pointer hover:bg-zinc-50"
            }`}
          >
            <input
              type="checkbox"
              checked={targetIds.has(item.id)}
              disabled={item.autoTimeline}
              onChange={() => onToggleTarget(item.id)}
              className="h-3.5 w-3.5 shrink-0 accent-violet-600"
            />
            <span className="flex-1 truncate text-zinc-800">{item.name}</span>
            <span className="shrink-0 text-[11px] text-zinc-400">{scheduleStatusLabel(item)}</span>
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={targetIds.size === 0}
        className="self-end rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        선택한 {targetIds.size}개 업무로 AI에게 요청 →
      </button>
    </div>
  );
}

function formatReviewTimestamp(ranAt: number): string {
  return new Date(ranAt).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ReviewIssueListProps = {
  issues: ValidatedReviewIssue[];
  onIssueClick: (workItemId: string | null) => void;
};

function ReviewIssueList({ issues, onIssueClick }: ReviewIssueListProps) {
  if (issues.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        AI가 특별히 확인이 필요하다고 판단한 항목이 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {issues.map((issue, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onIssueClick(issue.workItemId)}
          disabled={!issue.workItemId}
          className={`flex flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-left transition ${
            issue.workItemId ? "hover:border-violet-300 hover:bg-violet-50/50" : "cursor-default"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_BADGE_CLASS[issue.severity] ?? "bg-zinc-100 text-zinc-600"}`}
            >
              {issue.severity}
            </span>
            {issue.itemName && (
              <span className="text-xs font-medium text-zinc-500">{issue.itemName}</span>
            )}
          </div>
          <p className="text-sm font-medium text-zinc-900">{issue.title}</p>
          <p className="text-xs text-zinc-500">{issue.description}</p>
        </button>
      ))}
    </div>
  );
}

type ReviewViewProps = {
  status: ReviewRunStatus;
  error: string | null;
  history: ReviewHistoryEntry[];
  projectId: string;
  onBack: () => void;
  onRunNew: () => void;
  onIssueClick: (workItemId: string | null) => void;
};

function ReviewView({
  status,
  error,
  history,
  projectId,
  onBack,
  onRunNew,
  onIssueClick,
}: ReviewViewProps) {
  const [latest, ...older] = history;

  return (
    <div>
      <BackButton onClick={onBack} />
      <h3 className="mb-3 text-sm font-semibold text-zinc-900">✨ 프로젝트 검토</h3>

      {status === "loading" && <LoadingRow />}

      {status === "error" && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {status !== "loading" && history.length === 0 && (
        <p className="text-sm text-zinc-500">아직 검토 결과가 없습니다.</p>
      )}

      {latest && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-zinc-400">{formatReviewTimestamp(latest.ranAt)} 검토 결과</p>
          <ReviewIssueList issues={latest.issues} onIssueClick={onIssueClick} />
        </div>
      )}

      {older.length > 0 && (
        <details
          className="mt-3 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600"
          onToggle={(event) => {
            // "이전 검토 기록" is the only existing UI for revisiting an
            // AI result already shown once — only count opening it, not
            // the initial display of the latest result and not closing it.
            if (event.currentTarget.open) {
              trackEvent({ eventType: "ai_result_reopen", projectId });
            }
          }}
        >
          <summary className="cursor-pointer font-medium text-zinc-700">
            이전 검토 기록 {older.length}건
          </summary>
          <div className="mt-2 flex flex-col gap-4">
            {older.map((entry, index) => (
              <div key={index}>
                <p className="mb-1.5 text-[11px] text-zinc-400">
                  {formatReviewTimestamp(entry.ranAt)} 검토 결과
                </p>
                <ReviewIssueList issues={entry.issues} onIssueClick={onIssueClick} />
              </div>
            ))}
          </div>
        </details>
      )}

      <button
        type="button"
        onClick={onRunNew}
        disabled={status === "loading"}
        className="mt-4 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↻ 새로 검토하기
      </button>
    </div>
  );
}
