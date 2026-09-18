"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, WorkItem } from "@/types/project";
import {
  createWorkItem,
  getNextSiblingOrder,
  DEFAULT_ORDER_STEP,
  type WorkItemDisplayRow,
} from "@/lib/work-items/tree-utils";
import {
  buildFillScheduleRequest,
  buildProjectReviewRequest,
  buildWorkStructureRequest,
  parseRequiredTasks,
  getDefaultScheduleTargetIds,
  getScheduleChecklistRows,
  CONDITION_NOTE_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from "@/lib/ai/build-payload";
import {
  validateScheduleSuggestions,
  type ValidatedScheduleSuggestions,
} from "@/lib/ai/validate-schedule-suggestions";
import {
  validateReviewIssues,
  type ValidatedReviewIssue,
} from "@/lib/ai/validate-review-issues";
import {
  validateWorkStructureResponse,
  type WorkStructurePreviewNode,
  type RequiredTaskCoverageResult,
} from "@/lib/ai/validate-work-structure";
import { trackEvent } from "@/lib/analytics";
import { useLanguage } from "@/lib/i18n/language-context";
import { useT, type TranslateFn } from "@/lib/i18n/use-t";
import type { Language } from "@/lib/i18n/language";
import { GranularitySelector, type GranularityLevel } from "@/components/ai/granularity-selector";

type AiView = "menu" | "fill-schedule" | "review" | "build-structure";

type ScheduleStep = "select" | "loading" | "error" | "result";
type ReviewRunStatus = "idle" | "loading" | "error";
type StructureStep = "form" | "loading" | "error" | "result";
// "rebuild" wipes every existing work item and replaces the whole tree with
// the applied structure; "append" adds the applied structure as new root
// items below whatever already exists. Chosen up front but only acted on at
// apply time (applyWorkStructure), since nothing touches `project` before
// the user explicitly applies — see the StructureNode preview-only note.
type StructureBuildMode = "rebuild" | "append";

/** Editable preview tree node — mirrors the validated AI output shape plus a
 * client-only `checked` flag, since selection state has no server meaning. */
type StructureNode = {
  tempId: string;
  name: string;
  duplicateWarning: boolean;
  checked: boolean;
  children: StructureNode[];
};

function toStructureNodes(nodes: WorkStructurePreviewNode[]): StructureNode[] {
  return nodes.map((node) => ({
    tempId: node.tempId,
    name: node.name,
    duplicateWarning: node.duplicateWarning,
    checked: true,
    children: toStructureNodes(node.children),
  }));
}

function countStructureNodes(nodes: StructureNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countStructureNodes(node.children), 0);
}

function countCheckedStructureNodes(nodes: StructureNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + (node.checked ? 1 : 0) + countCheckedStructureNodes(node.children),
    0
  );
}

function renameStructureNode(nodes: StructureNode[], tempId: string, name: string): StructureNode[] {
  return nodes.map((node) =>
    node.tempId === tempId
      ? { ...node, name }
      : { ...node, children: renameStructureNode(node.children, tempId, name) }
  );
}

function deleteStructureNode(nodes: StructureNode[], tempId: string): StructureNode[] {
  return nodes
    .filter((node) => node.tempId !== tempId)
    .map((node) => ({ ...node, children: deleteStructureNode(node.children, tempId) }));
}

function setStructureSubtreeChecked(nodes: StructureNode[], checked: boolean): StructureNode[] {
  return nodes.map((node) => ({
    ...node,
    checked,
    children: setStructureSubtreeChecked(node.children, checked),
  }));
}

// Unchecking a node cascades to its whole subtree (a task can't be included
// without its parent), matching the "부모 체크 해제 시 하위 항목도 함께
// 비활성화" preview rule.
function setStructureNodeChecked(
  nodes: StructureNode[],
  tempId: string,
  checked: boolean
): StructureNode[] {
  return nodes.map((node) => {
    if (node.tempId === tempId) {
      return { ...node, checked, children: setStructureSubtreeChecked(node.children, checked) };
    }
    return { ...node, children: setStructureNodeChecked(node.children, tempId, checked) };
  });
}

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
  const t = useT();
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

  const [structureStep, setStructureStep] = useState<StructureStep>("form");
  const [structureTopic, setStructureTopic] = useState("");
  const [structureRequiredTasksRaw, setStructureRequiredTasksRaw] = useState("");
  const [structureGranularity, setStructureGranularity] = useState<GranularityLevel>(3);
  // "append" (기존 트리 아래에 이어 붙이기) is the default so behavior matches
  // what this feature always did before "다시 만들기" existed.
  const [structureBuildMode, setStructureBuildMode] = useState<StructureBuildMode>("append");
  const [structureError, setStructureError] = useState<string | null>(null);
  // Preview-only state: never touches `project`/`updateWorkItems` until the
  // user explicitly applies it (see applyWorkStructure).
  const [structureTree, setStructureTree] = useState<StructureNode[] | null>(null);
  const [structureNotes, setStructureNotes] = useState<string[]>([]);
  const [structureCoverage, setStructureCoverage] = useState<RequiredTaskCoverageResult[]>([]);
  // True while showing the "이 작업은 되돌릴 수 없습니다" confirm step in place
  // of the normal apply button — only reachable in "rebuild" mode, since that's
  // the only destructive path (see requestApplyWorkStructure).
  const [isConfirmingRebuildApply, setIsConfirmingRebuildApply] = useState(false);

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
    setStructureStep("form");
    setStructureTopic("");
    setStructureRequiredTasksRaw("");
    setStructureGranularity(3);
    setStructureBuildMode("append");
    setStructureError(null);
    setStructureTree(null);
    setStructureNotes([]);
    setStructureCoverage([]);
    setIsConfirmingRebuildApply(false);
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
        setScheduleError(friendlyErrorMessage(json?.errorCode, t));
        trackEvent({ eventType: "ai_schedule_fail", projectId: project.id });
        return;
      }

      const validated = validateScheduleSuggestions(project, targetIds, json);

      if (validated.applicable.length === 0 && validated.flagged.length === 0) {
        setScheduleStep("error");
        setScheduleError(t("AI가 제안할 수 있는 일정을 찾지 못했습니다."));
        trackEvent({ eventType: "ai_schedule_fail", projectId: project.id });
        return;
      }

      setScheduleResult(validated);
      setScheduleStep("result");
      trackEvent({ eventType: "ai_schedule", projectId: project.id });
      pendingSuccessRef.current = true;
    } catch {
      setScheduleStep("error");
      setScheduleError(t("AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요."));
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
        setReviewError(friendlyErrorMessage(json?.errorCode, t));
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
      setReviewError(t("AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요."));
      trackEvent({ eventType: "ai_review_fail", projectId: project.id });
    }
  };

  const handleIssueClick = (workItemId: string | null) => {
    if (!workItemId) return;
    closePanel();
    onJumpToWorkItem(workItemId);
  };

  const openBuildStructure = () => {
    setView("build-structure");
    setStructureStep("form");
    setStructureTopic("");
    setStructureRequiredTasksRaw("");
    setStructureGranularity(3);
    setStructureBuildMode("append");
    setStructureError(null);
    setStructureTree(null);
    setStructureNotes([]);
    setStructureCoverage([]);
    setIsConfirmingRebuildApply(false);
  };

  const submitBuildStructure = async () => {
    const topic = structureTopic.trim();
    const requiredTasks = parseRequiredTasks(structureRequiredTasksRaw);

    if (!topic) return;

    const payload = buildWorkStructureRequest(project, {
      projectTopic: topic,
      requiredTasks,
      granularity: structureGranularity,
    });

    setStructureStep("loading");
    setStructureError(null);

    try {
      const response = await fetch("/api/ai/build-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        setStructureStep("error");
        setStructureError(friendlyErrorMessage(json?.errorCode, t));
        trackEvent({ eventType: "ai_build_structure_fail", projectId: project.id });
        return;
      }

      const validated = validateWorkStructureResponse(project, requiredTasks, json);

      if (!validated || validated.items.length === 0) {
        setStructureStep("error");
        setStructureError(t("AI가 제안할 업무를 찾지 못했습니다."));
        trackEvent({ eventType: "ai_build_structure_fail", projectId: project.id });
        return;
      }

      setStructureTree(toStructureNodes(validated.items));
      setStructureNotes(validated.notes);
      setStructureCoverage(validated.requiredTaskCoverage);
      setStructureStep("result");
      trackEvent({ eventType: "ai_build_structure", projectId: project.id });
      pendingSuccessRef.current = true;
    } catch {
      setStructureStep("error");
      setStructureError(t("AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요."));
      trackEvent({ eventType: "ai_build_structure_fail", projectId: project.id });
    }
  };

  const toggleStructureNode = (tempId: string, checked: boolean) => {
    setStructureTree((current) =>
      current ? setStructureNodeChecked(current, tempId, checked) : current
    );
  };

  const renameStructureNodeById = (tempId: string, name: string) => {
    setStructureTree((current) =>
      current ? renameStructureNode(current, tempId, name) : current
    );
  };

  const deleteStructureNodeById = (tempId: string) => {
    setStructureTree((current) =>
      current ? deleteStructureNode(current, tempId) : current
    );
  };

  const applyWorkStructure = () => {
    if (!structureTree) return;

    const isRebuild = structureBuildMode === "rebuild";
    const newItems: WorkItem[] = [];
    // In rebuild mode the whole existing tree is being replaced, so new root
    // items order from scratch instead of after whatever already exists.
    let order = getNextSiblingOrder(isRebuild ? [] : project.workItems, null);

    const walk = (nodes: StructureNode[], parentId: string | null) => {
      for (const node of nodes) {
        if (!node.checked) continue;

        const name = node.name.trim();

        if (!name) continue;

        const item = createWorkItem({ id: crypto.randomUUID(), name, parentId, order });
        order += DEFAULT_ORDER_STEP;
        newItems.push(item);
        walk(node.children, item.id);
      }
    };

    walk(structureTree, null);

    if (newItems.length === 0) return;

    updateWorkItems((items) => (isRebuild ? newItems : [...items, ...newItems]));
    trackEvent({ eventType: "ai_build_structure_apply", projectId: project.id });
    closePanel();
  };

  // Fronts applyWorkStructure with a confirm step, but only in rebuild mode —
  // append is non-destructive and applies immediately like before.
  const requestApplyWorkStructure = () => {
    if (structureBuildMode === "rebuild" && !isConfirmingRebuildApply) {
      setIsConfirmingRebuildApply(true);
      return;
    }

    applyWorkStructure();
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label={t("AI 기능 (베타)")}
        className={`fixed bottom-20 right-6 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-base font-semibold text-white shadow-lg transition-[right,transform] duration-200 ease-out hover:bg-violet-700 active:scale-90 ${
          isDetailPanelOpen ? "md:right-[344px]" : ""
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
                  {t("✨ AI 기능")}
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                    Beta
                  </span>
                </h2>
                <p className="text-xs text-zinc-500">
                  {t("현재 베타 테스트 중인 기능입니다.")}
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label={t("AI 패널 닫기")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {view === "menu" && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-relaxed text-zinc-600">
                    {t(
                      "TO-DO-LINE의 프로젝트 데이터를 바탕으로 AI의 도움을 받아 일정을 작성하고 프로젝트를 검토할 수 있습니다. AI 처리를 위해 현재 프로젝트의 업무 구조와 일정 정보가 외부 LLM으로 전송됩니다.",
                    )}
                  </p>

                  <button
                    type="button"
                    onClick={openBuildStructure}
                    className="rounded-lg border border-zinc-200 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/50"
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      {t("AI 업무 구조 만들기")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t(
                        "프로젝트 설명을 입력하면 AI가 업무 구조 초안을 만들어 드립니다. 검토 후 원하는 업무만 Work Tree에 반영할 수 있습니다.",
                      )}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={openFillSchedule}
                    className="rounded-lg border border-zinc-200 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/50"
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      {t("AI 일정 채우기")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t(
                        "직접 선택한 업무에 대해서만 일정을 제안합니다. 선택하지 않은 업무는 AI가 변경하지 않습니다.",
                      )}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={openReview}
                    className="rounded-lg border border-zinc-200 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/50"
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      {t("프로젝트 검토하기")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t("완성된 프로젝트 구조와 일정을 AI에게 검토받습니다.")}
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

              {view === "build-structure" && (
                <BuildStructureView
                  step={structureStep}
                  topic={structureTopic}
                  requiredTasksRaw={structureRequiredTasksRaw}
                  granularity={structureGranularity}
                  buildMode={structureBuildMode}
                  error={structureError}
                  tree={structureTree}
                  notes={structureNotes}
                  coverage={structureCoverage}
                  isConfirmingRebuildApply={isConfirmingRebuildApply}
                  onTopicChange={setStructureTopic}
                  onRequiredTasksRawChange={setStructureRequiredTasksRaw}
                  onGranularityChange={setStructureGranularity}
                  onBuildModeChange={setStructureBuildMode}
                  onBack={() => setView("menu")}
                  onBackToForm={() => setStructureStep("form")}
                  onSubmit={submitBuildStructure}
                  onToggleNode={toggleStructureNode}
                  onRenameNode={renameStructureNodeById}
                  onDeleteNode={deleteStructureNodeById}
                  onRequestApply={requestApplyWorkStructure}
                  onCancelRebuildApply={() => setIsConfirmingRebuildApply(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function friendlyErrorMessage(errorCode: unknown, t: TranslateFn): string {
  switch (errorCode) {
    case "rate_limited":
      return t("지금 AI 요청이 많습니다. 잠시 후 다시 시도해주세요.");
    case "timeout":
      return t("AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    case "invalid_request":
      return t("요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
    case "missing_api_key":
      return t(
        "AI 기능이 아직 설정되지 않았습니다. 잠시 후 다시 시도해도 안 되면 관리자에게 문의해주세요.",
      );
    default:
      return t("AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
}

function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
    >
      {label ?? t("← 뒤로")}
    </button>
  );
}

function LoadingRow() {
  const t = useT();
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-600" />
      {t("AI가 분석하고 있습니다...")}
    </div>
  );
}

function scheduleStatusLabel(item: WorkItem, t: TranslateFn): string {
  if (item.autoTimeline) return t("자동 반영");
  if (item.isUndecided || !item.startDate || !item.endDate) return t("미정");
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
  const t = useT();
  return (
    <div>
      <BackButton onClick={onBack} />
      <h3 className="mb-1 text-sm font-semibold text-zinc-900">
        {t("✨ AI 일정 채우기")}
      </h3>

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
              {t("대상 다시 선택")}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              {t("다시 시도")}
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
            <p className="text-sm text-zinc-500">
              {t("적용 가능한 일정 제안이 없습니다.")}
            </p>
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
                {t("검토가 필요해 제외된 항목 {count}건", {
                  count: result.flagged.length,
                })}
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {result.flagged.map((flag, index) => (
                  <li key={index}>
                    {flag.itemName ?? t("알 수 없는 항목")}: {t(flag.reason)}
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
              {t("취소")}
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={result.applicable.length === 0}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("적용하기")}
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
  const t = useT();
  const rows: WorkItemDisplayRow[] = getScheduleChecklistRows(project);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700">
          {t("프로젝트 조건 (선택)")}
        </label>
        <textarea
          value={conditionNote}
          onChange={(event) => onConditionNoteChange(event.target.value)}
          maxLength={CONDITION_NOTE_MAX_LENGTH}
          rows={2}
          placeholder={t(
            "예: 참여 인원, 업무 강도 및 난이도, 업무 종료 일자, 업무 불가 기간, 업무 특이사항 등",
          )}
          className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          {t(
            "이번 초안 생성 1회에만 적용되며 저장되지 않습니다. 개별 업무의 메모도 함께 참고합니다.",
          )}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        {t(
          "체크된 업무만 AI가 일정을 제안합니다. 이미 일정이 있는 업무도 체크하면 새 일정으로 덮어쓸 수 있으니, 그대로 유지하고 싶은 업무는 체크를 해제하세요. (하위 일정 자동 반영 업무는 선택할 수 없습니다.)",
        )}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          {t("전체 선택")}
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          {t("전체 해제")}
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
            <span className="shrink-0 text-[11px] text-zinc-400">{scheduleStatusLabel(item, t)}</span>
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={targetIds.size === 0}
        className="self-end rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("선택한 {count}개 업무로 AI에게 요청 →", { count: targetIds.size })}
      </button>
    </div>
  );
}

function formatReviewTimestamp(ranAt: number, lang: Language): string {
  return new Date(ranAt).toLocaleString(lang === "en" ? "en-US" : "ko-KR", {
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
  const t = useT();
  if (issues.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {t("AI가 특별히 확인이 필요하다고 판단한 항목이 없습니다.")}
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
              {t(issue.severity)}
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
  const t = useT();
  const { lang } = useLanguage();
  const [latest, ...older] = history;

  return (
    <div>
      <BackButton onClick={onBack} />
      <h3 className="mb-3 text-sm font-semibold text-zinc-900">
        {t("✨ 프로젝트 검토")}
      </h3>

      {status === "loading" && <LoadingRow />}

      {status === "error" && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {status !== "loading" && history.length === 0 && (
        <p className="text-sm text-zinc-500">{t("아직 검토 결과가 없습니다.")}</p>
      )}

      {latest && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-zinc-400">
            {t("{time} 검토 결과", {
              time: formatReviewTimestamp(latest.ranAt, lang),
            })}
          </p>
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
            {t("이전 검토 기록 {count}건", { count: older.length })}
          </summary>
          <div className="mt-2 flex flex-col gap-4">
            {older.map((entry, index) => (
              <div key={index}>
                <p className="mb-1.5 text-[11px] text-zinc-400">
                  {t("{time} 검토 결과", {
                    time: formatReviewTimestamp(entry.ranAt, lang),
                  })}
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
        {t("↻ 새로 검토하기")}
      </button>
    </div>
  );
}

type BuildStructureViewProps = {
  step: StructureStep;
  topic: string;
  requiredTasksRaw: string;
  granularity: GranularityLevel;
  buildMode: StructureBuildMode;
  error: string | null;
  tree: StructureNode[] | null;
  notes: string[];
  coverage: RequiredTaskCoverageResult[];
  isConfirmingRebuildApply: boolean;
  onTopicChange: (value: string) => void;
  onRequiredTasksRawChange: (value: string) => void;
  onGranularityChange: (value: GranularityLevel) => void;
  onBuildModeChange: (mode: StructureBuildMode) => void;
  onBack: () => void;
  onBackToForm: () => void;
  onSubmit: () => void;
  onToggleNode: (tempId: string, checked: boolean) => void;
  onRenameNode: (tempId: string, name: string) => void;
  onDeleteNode: (tempId: string) => void;
  onRequestApply: () => void;
  onCancelRebuildApply: () => void;
};

function BuildStructureView({
  step,
  topic,
  requiredTasksRaw,
  granularity,
  buildMode,
  error,
  tree,
  notes,
  coverage,
  isConfirmingRebuildApply,
  onTopicChange,
  onRequiredTasksRawChange,
  onGranularityChange,
  onBuildModeChange,
  onBack,
  onBackToForm,
  onSubmit,
  onToggleNode,
  onRenameNode,
  onDeleteNode,
  onRequestApply,
  onCancelRebuildApply,
}: BuildStructureViewProps) {
  const t = useT();
  const totalCount = tree ? countStructureNodes(tree) : 0;
  const checkedCount = tree ? countCheckedStructureNodes(tree) : 0;
  const groupCount = tree ? tree.length : 0;
  const requiredCount = parseRequiredTasks(requiredTasksRaw).length;
  const uncoveredTasks = coverage.filter((entry) => !entry.covered).map((entry) => entry.requiredTask);
  const canSubmit = topic.trim().length > 0;

  return (
    <div>
      <BackButton onClick={onBack} />
      <h3 className="mb-2 text-sm font-semibold text-zinc-900">
        {t("✨ AI 업무 구조 만들기")}
      </h3>

      <div className="mb-4">
        <div
          role="group"
          aria-label={t("다시 만들기 / 이어 만들기")}
          className="flex w-fit items-center rounded-md border border-zinc-300 p-0.5 text-xs font-medium"
        >
          <button
            type="button"
            onClick={() => onBuildModeChange("rebuild")}
            aria-pressed={buildMode === "rebuild"}
            className={`rounded-[5px] px-3 py-1 transition ${
              buildMode === "rebuild" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t("다시 만들기")}
          </button>
          <button
            type="button"
            onClick={() => onBuildModeChange("append")}
            aria-pressed={buildMode === "append"}
            className={`rounded-[5px] px-3 py-1 transition ${
              buildMode === "append" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t("이어 만들기")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          {buildMode === "rebuild"
            ? t("반영하면 기존 Work Tree를 모두 지우고 새로 만듭니다.")
            : t("반영하면 기존 Work Tree 아래에 이어서 추가됩니다.")}
        </p>
      </div>

      {step === "form" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              {t("어떤 프로젝트인가요?")}
            </label>
            <input
              type="text"
              value={topic}
              onChange={(event) => onTopicChange(event.target.value)}
              maxLength={TOPIC_MAX_LENGTH}
              placeholder={t(
                "예: 디지털마케팅, 신제품 출시, 대학 축제 기획, 신규 웹사이트 제작, 인스타그램 채널 운영",
              )}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              {t("이 프로젝트에서 반드시 수행해야 하는 과업을 알려주세요. (선택)")}
            </label>
            <textarea
              value={requiredTasksRaw}
              onChange={(event) => onRequiredTasksRawChange(event.target.value)}
              rows={2}
              placeholder={t("예: 인스타그램, 유튜브, X, 온라인 쇼룸, 인플루언서 마케팅")}
              className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              {t("쉼표(,) 또는 줄바꿈으로 구분해서 여러 개를 입력할 수 있습니다.")}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              {t("업무를 얼마나 세부적으로 나눌까요?")}
            </label>
            <GranularitySelector value={granularity} onChange={onGranularityChange} />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="self-end rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("AI에게 업무 구조 요청 →")}
          </button>
        </div>
      )}

      {step === "loading" && <LoadingRow />}

      {step === "error" && (
        <div className="flex flex-col gap-3">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBackToForm}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              {t("입력 다시 확인")}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              {t("다시 시도")}
            </button>
          </div>
        </div>
      )}

      {step === "result" && tree && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">
            {requiredCount > 0
              ? t(
                  "입력한 필수 과업 {requiredCount}개를 분석하여 {groupCount}개의 업무 영역과 {totalCount}개의 업무로 구성했습니다.",
                  { requiredCount, groupCount, totalCount },
                )
              : t(
                  "AI가 프로젝트를 분석해 {groupCount}개의 업무 영역과 {totalCount}개의 업무를 제안했습니다.",
                  { groupCount, totalCount },
                )}
          </p>

          {uncoveredTasks.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t(
                "다음 필수 과업이 결과에 반영되지 않은 것 같습니다: {tasks}. 확인 후 필요하면 직접 추가해주세요.",
                { tasks: uncoveredTasks.join(", ") },
              )}
            </p>
          )}

          {tree.length > 0 ? (
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-zinc-200">
              {tree.map((node) => (
                <StructureNodeRow
                  key={node.tempId}
                  node={node}
                  depth={0}
                  onToggle={onToggleNode}
                  onRename={onRenameNode}
                  onDelete={onDeleteNode}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">{t("제안된 업무가 모두 삭제되었습니다.")}</p>
          )}

          {notes.length > 0 && (
            <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              {notes.map((note, index) => (
                <p key={index}>{note}</p>
              ))}
            </div>
          )}

          {isConfirmingRebuildApply && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {t(
                "기존에 있던 업무가 모두 삭제되고 선택한 업무로 Work Tree가 새로 만들어집니다. 되돌릴 수 없습니다.",
              )}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
            {isConfirmingRebuildApply ? (
              <>
                <button
                  type="button"
                  onClick={onCancelRebuildApply}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  {t("취소")}
                </button>
                <button
                  type="button"
                  onClick={onRequestApply}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
                >
                  {t("초기화하고 반영하기")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onBackToForm}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  {t("취소")}
                </button>
                <button
                  type="button"
                  onClick={onRequestApply}
                  disabled={checkedCount === 0}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("선택한 {count}개 업무 반영", { count: checkedCount })}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type StructureNodeRowProps = {
  node: StructureNode;
  depth: number;
  onToggle: (tempId: string, checked: boolean) => void;
  onRename: (tempId: string, name: string) => void;
  onDelete: (tempId: string) => void;
};

function StructureNodeRow({ node, depth, onToggle, onRename, onDelete }: StructureNodeRowProps) {
  const t = useT();

  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        className="flex items-center gap-2 border-b border-zinc-100 py-1.5 pr-2 last:border-b-0"
      >
        <input
          type="checkbox"
          checked={node.checked}
          onChange={(event) => onToggle(node.tempId, event.target.checked)}
          className="h-3.5 w-3.5 shrink-0 accent-violet-600"
        />
        <input
          type="text"
          value={node.name}
          onChange={(event) => onRename(node.tempId, event.target.value)}
          disabled={!node.checked}
          className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-zinc-800 focus:border-violet-300 focus:bg-white focus:outline-none disabled:text-zinc-400"
        />
        {node.duplicateWarning && (
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            {t("기존 업무와 이름 중복")}
          </span>
        )}
        <button
          type="button"
          onClick={() => onDelete(node.tempId)}
          aria-label={t("업무 삭제")}
          className="shrink-0 rounded-full p-1 text-zinc-300 transition hover:bg-zinc-100 hover:text-red-500"
        >
          ✕
        </button>
      </div>
      {node.children.map((child) => (
        <StructureNodeRow
          key={child.tempId}
          node={child}
          depth={depth + 1}
          onToggle={onToggle}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
