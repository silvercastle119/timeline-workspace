"use client";

import { useState } from "react";
import { getMaxTimelineEndDate } from "@/lib/timeline/timeline-validation";

type ProjectSettingsResult = { valid: true } | { valid: false; reason: string };

type MobileCreateProjectDialogProps = {
  defaultName: string;
  defaultTimelineStart: string;
  defaultTimelineEnd: string;
  onCreate: (
    name: string,
    timelineStart: string,
    timelineEnd: string
  ) => ProjectSettingsResult;
  onCancel: () => void;
};

export function MobileCreateProjectDialog({
  defaultName,
  defaultTimelineStart,
  defaultTimelineEnd,
  onCreate,
  onCancel,
}: MobileCreateProjectDialogProps) {
  const [nameDraft, setNameDraft] = useState(defaultName);
  const [startDraft, setStartDraft] = useState(defaultTimelineStart);
  const [endDraft, setEndDraft] = useState(defaultTimelineEnd);
  const [error, setError] = useState("");

  const handleCreate = () => {
    const trimmedName = nameDraft.trim();

    if (!trimmedName) {
      setError("프로젝트명을 입력해주세요.");
      return;
    }

    const result = onCreate(trimmedName, startDraft, endDraft);

    if (!result.valid) {
      setError(result.reason);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-zinc-900">새 프로젝트 만들기</h2>

        <div>
          <span className="mb-1 block text-xs text-zinc-500">프로젝트명</span>
          <input
            type="text"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
          />
        </div>

        <div>
          <span className="mb-1 block text-xs text-zinc-500">전체 Timeline</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDraft}
              onChange={(event) => setStartDraft(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600"
            />
            <span className="text-zinc-400">~</span>
            <input
              type="date"
              value={endDraft}
              max={getMaxTimelineEndDate(startDraft) ?? undefined}
              onChange={(event) => setEndDraft(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <span aria-hidden>+</span> 만들기
          </button>
        </div>
      </div>
    </div>
  );
}
