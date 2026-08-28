"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMobileProject } from "@/components/mobile/use-mobile-project";
import { MobileTimelineBar } from "@/components/mobile/mobile-timeline-bar";
import { MobileCheckpointList } from "@/components/mobile/mobile-checkpoint-list";
import { MobileToggle } from "@/components/mobile/mobile-toggle";
import { MobileConfirmDialog } from "@/components/mobile/mobile-confirm-dialog";
import {
  clampCheckpointsToRange,
  getDisplayTimelines,
  getEffectiveWorkItemTimelines,
} from "@/lib/work-items/tree-utils";
import { DEFAULT_COLOR_PALETTE } from "@/lib/work-items/color-utils";
import { getMobileBarBackground } from "@/components/mobile/mobile-timeline-visuals";
import type { Checkpoint, WorkItem } from "@/types/project";

const AUTO_UNDECIDED_MEMO = "일정 미정";

type MobileScheduleScreenProps = {
  itemId: string;
};

export function MobileScheduleScreen({ itemId }: MobileScheduleScreenProps) {
  const { project, isLoaded, commitScheduleEdit, deleteWorkItem } = useMobileProject();
  const router = useRouter();

  const originalItem = project.workItems.find((workItem) => workItem.id === itemId) ?? null;

  const [draft, setDraft] = useState<WorkItem | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // 화면 진입 시점의 상태를 로컬 draft로 스냅샷 뜬다. 이후 모든 편집은
  // "저장"을 누르기 전까지 전역 상태(useMobileProject)에 반영되지 않는다.
  // (렌더 중 상태 조정 패턴 — https://react.dev/learn/you-might-not-need-an-effect)
  if (isLoaded && originalItem && loadedItemId !== itemId) {
    setDraft(structuredClone(originalItem));
    setInitialSnapshot(JSON.stringify(originalItem));
    setLoadedItemId(itemId);
  }

  const hasChanges = draft !== null && JSON.stringify(draft) !== initialSnapshot;

  const hasChildren = project.workItems.some((workItem) => workItem.parentId === itemId);

  // 편집 중인 draft를 반영한 workItems — 저장 전이라도 날짜/자동반영/색상
  // 변경이 미리보기(effective/display timeline, Timeline 배경)에 바로
  // 보이도록 한다. 다른 업무는 저장된 값 그대로라 안전하다.
  const workItemsWithDraft = useMemo(
    () =>
      draft
        ? project.workItems.map((workItem) => (workItem.id === itemId ? draft : workItem))
        : project.workItems,
    [project.workItems, draft, itemId]
  );

  const effectiveTimelines = useMemo(
    () => getEffectiveWorkItemTimelines(workItemsWithDraft),
    [workItemsWithDraft]
  );
  const displayTimelines = useMemo(
    () =>
      getDisplayTimelines(workItemsWithDraft, effectiveTimelines, {
        startDate: project.timelineStart,
        endDate: project.timelineEnd,
      }),
    [workItemsWithDraft, effectiveTimelines, project.timelineStart, project.timelineEnd]
  );
  const effectiveTimeline = effectiveTimelines.get(itemId) ?? null;
  const displayTimeline = displayTimelines.get(itemId) ?? null;

  // 브라우저/제스처 뒤로가기 best-effort 가드 (완전한 차단은 보장 못함).
  useEffect(() => {
    if (!hasChanges) return;

    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      setIsLeaveConfirmOpen(true);
      window.history.pushState(null, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [hasChanges]);

  const goBackToList = () => router.push("/m");

  const updateDraft = (updater: (item: WorkItem) => WorkItem) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  if (!isLoaded || (originalItem && !draft)) {
    return <div className="p-4 text-sm text-zinc-500">불러오는 중...</div>;
  }

  if (!originalItem || !draft) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-zinc-500">업무를 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={goBackToList}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const handleBackOrCancel = () => {
    if (hasChanges) {
      setIsLeaveConfirmOpen(true);
      return;
    }

    goBackToList();
  };

  const handleSave = () => {
    commitScheduleEdit(itemId, draft);
    goBackToList();
  };

  const handleDelete = () => {
    deleteWorkItem(itemId);
    goBackToList();
  };

  const updateDateField = (field: "startDate" | "endDate", value: string | null) => {
    updateDraft((item) => {
      const updated = { ...item, [field]: value };

      return {
        ...updated,
        checkpoints: clampCheckpointsToRange(
          updated.checkpoints,
          updated.startDate,
          updated.endDate
        ),
      };
    });
  };

  // PC toggleUndecided(page.tsx:1505~1544)와 동일한 memo 부기/철회 규칙.
  const setUndecided = (isUndecided: boolean) => {
    updateDraft((item) => {
      if (isUndecided) {
        const memo = item.memo ? `${item.memo} / ${AUTO_UNDECIDED_MEMO}` : AUTO_UNDECIDED_MEMO;

        return { ...item, isUndecided, memo, autoMemoNote: AUTO_UNDECIDED_MEMO };
      }

      if (item.autoMemoNote) {
        if (item.memo === item.autoMemoNote) {
          return { ...item, isUndecided, memo: "", autoMemoNote: null };
        }

        const suffix = ` / ${item.autoMemoNote}`;

        if (item.memo.endsWith(suffix)) {
          return {
            ...item,
            isUndecided,
            memo: item.memo.slice(0, -suffix.length),
            autoMemoNote: null,
          };
        }
      }

      return { ...item, isUndecided, autoMemoNote: null };
    });
  };

  const addCheckpointDraft = () => {
    updateDraft((item) => {
      if (!item.startDate || !item.endDate) return item;

      const newCheckpoint: Checkpoint = {
        id: crypto.randomUUID(),
        date: item.startDate,
        label: "",
      };

      return { ...item, checkpoints: [...item.checkpoints, newCheckpoint] };
    });
  };

  const updateCheckpointDraft = (
    checkpointId: string,
    field: "date" | "label",
    value: string
  ) => {
    updateDraft((item) => ({
      ...item,
      checkpoints: item.checkpoints.map((checkpoint) => {
        if (checkpoint.id !== checkpointId) return checkpoint;
        if (field === "label") return { ...checkpoint, label: value };

        if (!item.startDate || !item.endDate) return { ...checkpoint, date: value };

        const clamped =
          value < item.startDate ? item.startDate : value > item.endDate ? item.endDate : value;

        return { ...checkpoint, date: clamped };
      }),
    }));
  };

  const deleteCheckpointDraft = (checkpointId: string) => {
    updateDraft((item) => ({
      ...item,
      checkpoints: item.checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId),
    }));
  };

  const isDateEditable = !draft.autoTimeline && !draft.isUndecided;
  const canEditCheckpoints =
    !draft.autoTimeline &&
    !draft.isUndecided &&
    Boolean(draft.startDate) &&
    Boolean(draft.endDate);

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <button
          type="button"
          onClick={handleBackOrCancel}
          aria-label="뒤로"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
        >
          ←
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-900">
          업무 설정
        </h1>
      </header>

      <div className="flex-1 space-y-6 overflow-auto p-4 pb-24">
        <section className="space-y-1">
          <MobileToggle
            label="활성 상태"
            checked={draft.active}
            onChange={(checked) => updateDraft((item) => ({ ...item, active: checked }))}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">업무명</h2>
          <input
            type="text"
            value={draft.name}
            onChange={(event) =>
              updateDraft((item) => ({ ...item, name: event.target.value }))
            }
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
          />
        </section>

        <section className="space-y-1">
          {hasChildren && (
            <MobileToggle
              label="하위 일정 자동 반영"
              checked={draft.autoTimeline}
              onChange={(checked) =>
                updateDraft((item) => ({ ...item, autoTimeline: checked }))
              }
            />
          )}
          <MobileToggle
            label="일정 미정"
            checked={draft.isUndecided}
            disabled={draft.autoTimeline}
            onChange={setUndecided}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">일정</h2>
          {draft.autoTimeline ? (
            <p className="text-xs text-zinc-500">
              하위 업무 일정에 따라 자동으로 계산됩니다
              {effectiveTimeline
                ? ` (${effectiveTimeline.startDate} ~ ${effectiveTimeline.endDate})`
                : ""}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={draft.startDate ?? ""}
                disabled={!isDateEditable}
                onChange={(event) => updateDateField("startDate", event.target.value || null)}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-100"
              />
              <span className="text-zinc-400">~</span>
              <input
                type="date"
                value={draft.endDate ?? ""}
                disabled={!isDateEditable}
                onChange={(event) => updateDateField("endDate", event.target.value || null)}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-100"
              />
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">색상</h2>
          <div className="flex flex-wrap items-center gap-2">
            {DEFAULT_COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => updateDraft((item) => ({ ...item, color }))}
                aria-label={`색상 ${color}`}
                className={`h-9 w-9 shrink-0 rounded-full border-2 ${
                  draft.color === color ? "border-blue-600" : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Timeline</h2>
          <MobileTimelineBar
            startDate={displayTimeline?.startDate ?? null}
            endDate={displayTimeline?.endDate ?? null}
            checkpoints={draft.checkpoints}
            background={
              displayTimeline
                ? getMobileBarBackground(draft, displayTimeline, workItemsWithDraft)
                : {}
            }
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">체크포인트</h2>
          {canEditCheckpoints ? (
            <MobileCheckpointList
              checkpoints={draft.checkpoints}
              onAdd={addCheckpointDraft}
              onUpdate={updateCheckpointDraft}
              onDelete={deleteCheckpointDraft}
            />
          ) : (
            <p className="text-xs text-zinc-500">
              일정이 확정된 업무에서만 체크포인트를 설정할 수 있습니다.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">메모</h2>
          <textarea
            rows={3}
            value={draft.memo}
            onChange={(event) =>
              updateDraft((item) => ({ ...item, memo: event.target.value }))
            }
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
          />
        </section>

        <section>
          <button
            type="button"
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="w-full rounded-md border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            업무 삭제
          </button>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-zinc-200 bg-white p-3">
        <button
          type="button"
          onClick={handleBackOrCancel}
          className="flex-1 rounded-md border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          저장
        </button>
      </div>

      {isLeaveConfirmOpen && (
        <MobileConfirmDialog
          title="변경사항을 저장하지 않고 나가시겠습니까?"
          description="지금 나가면 이번 화면에서 수정한 내용이 사라집니다."
          confirmLabel="나가기"
          danger
          onConfirm={goBackToList}
          onCancel={() => setIsLeaveConfirmOpen(false)}
        />
      )}

      {isDeleteConfirmOpen && (
        <MobileConfirmDialog
          title={`"${draft.name}" 업무를 삭제하시겠습니까?`}
          description={
            hasChildren
              ? "하위 업무도 함께 삭제되며, 되돌릴 수 없습니다."
              : "삭제하면 되돌릴 수 없습니다."
          }
          confirmLabel="삭제"
          danger
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteConfirmOpen(false)}
        />
      )}
    </div>
  );
}
