"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getMaxTimelineEndDate } from "@/lib/timeline/timeline-validation";
import {
  listProjectSummaries,
  loadProjectById,
  type StoredProjectSummary,
} from "@/lib/persistence/indexed-db";
import { MobileConfirmDialog } from "@/components/mobile/mobile-confirm-dialog";
import { MobileCreateProjectDialog } from "@/components/mobile/mobile-create-project-dialog";
import type { ImportDiff } from "@/lib/export/excel-import";
import type { Project } from "@/types/project";

type ProjectSettingsResult = { valid: true } | { valid: false; reason: string };

type MobileProjectManagementSheetProps = {
  project: Project;
  onSaveSettings: (
    name: string,
    timelineStart: string,
    timelineEnd: string
  ) => ProjectSettingsResult;
  onSwitchProject: (nextProject: Project) => void;
  onCreateProject: (
    name: string,
    timelineStart: string,
    timelineEnd: string
  ) => ProjectSettingsResult;
  onClose: () => void;
};

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function countDiffEntries(diff: ImportDiff) {
  return {
    added: diff.workItems.added.length,
    modified: diff.workItems.modified.length,
    deleted: diff.workItems.deleted.length,
  };
}

export function MobileProjectManagementSheet({
  project,
  onSaveSettings,
  onSwitchProject,
  onCreateProject,
  onClose,
}: MobileProjectManagementSheetProps) {
  const router = useRouter();

  // 내 프로젝트
  const [projectSummaries, setProjectSummaries] = useState<StoredProjectSummary[] | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [createDefaults, setCreateDefaults] = useState<{
    timelineStart: string;
    timelineEnd: string;
  } | null>(null);

  // 현재 프로젝트 설정
  const [nameDraft, setNameDraft] = useState(project.name);
  const [startDraft, setStartDraft] = useState(project.timelineStart);
  const [endDraft, setEndDraft] = useState(project.timelineEnd);
  const [settingsError, setSettingsError] = useState("");

  // 데이터 관리
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Project | null>(null);
  const [pendingDiff, setPendingDiff] = useState<ImportDiff | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    listProjectSummaries().then((summaries) => {
      if (!cancelled) setProjectSummaries(summaries);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSwitchProject = async (summary: StoredProjectSummary) => {
    if (summary.id === project.id || switchingId) return;

    setSwitchingId(summary.id);
    setSwitchError(null);

    try {
      const loaded = await loadProjectById(summary.id);

      if (!loaded) {
        setSwitchError("프로젝트를 불러오지 못했습니다.");
        return;
      }

      onSwitchProject(loaded);
      onClose();
    } catch {
      setSwitchError("프로젝트를 불러오지 못했습니다.");
    } finally {
      setSwitchingId(null);
    }
  };

  const openCreateProjectDialog = () => {
    const today = new Date();
    const timelineEndDate = new Date(today);
    timelineEndDate.setDate(timelineEndDate.getDate() + 90);

    setCreateDefaults({
      timelineStart: getLocalDateString(today),
      timelineEnd: getLocalDateString(timelineEndDate),
    });
  };

  const handleCreateProject = (name: string, timelineStart: string, timelineEnd: string) => {
    const result = onCreateProject(name, timelineStart, timelineEnd);

    if (result.valid) {
      setCreateDefaults(null);
      onClose();
      router.push("/m");
    }

    return result;
  };

  const handleSaveSettings = () => {
    const trimmedName = nameDraft.trim();

    if (!trimmedName) {
      setSettingsError("프로젝트명을 입력해주세요.");
      return;
    }

    const result = onSaveSettings(trimmedName, startDraft, endDraft);

    if (!result.valid) {
      setSettingsError(result.reason);
      return;
    }

    onClose();
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const { exportProjectToExcel } = await import("@/lib/export/excel-export");
      await exportProjectToExcel(project);
    } catch {
      setExportError("Excel 내보내기에 실패했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const { parseExcelToProject, computeImportDiff, MAX_IMPORT_FILE_SIZE_BYTES } = await import(
        "@/lib/export/excel-import"
      );

      if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
        setImportError("파일 크기가 너무 큽니다.");
        return;
      }

      const buffer = await file.arrayBuffer();
      const imported = await parseExcelToProject(buffer, project);
      // PC의 "덮어쓰기" 모드와 동일: 현재 프로젝트 id를 유지한다.
      const nextProject: Project = { ...imported, id: project.id };
      const diff = computeImportDiff(project, nextProject);

      const hasChanges =
        diff.workItems.added.length > 0 ||
        diff.workItems.modified.length > 0 ||
        diff.workItems.deleted.length > 0 ||
        diff.checkpoints.added.length > 0 ||
        diff.checkpoints.modified.length > 0 ||
        diff.checkpoints.deleted.length > 0;

      if (!hasChanges) {
        onSwitchProject(nextProject);
        onClose();
        return;
      }

      setPendingImport(nextProject);
      setPendingDiff(diff);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "가져오기에 실패했습니다.");
    } finally {
      setIsImporting(false);
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;

    onSwitchProject(pendingImport);
    setPendingImport(null);
    setPendingDiff(null);
    onClose();
  };

  const cancelImport = () => {
    setPendingImport(null);
    setPendingDiff(null);
  };

  const diffCounts = pendingDiff ? countDiffEntries(pendingDiff) : null;
  const checkpointDiffCounts = pendingDiff
    ? {
        added: pendingDiff.checkpoints.added.length,
        modified: pendingDiff.checkpoints.modified.length,
        deleted: pendingDiff.checkpoints.deleted.length,
      }
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">프로젝트 관리</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-900">내 프로젝트</h3>

            {projectSummaries === null ? (
              <p className="text-xs text-zinc-500">불러오는 중...</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
                {projectSummaries.map((summary) => {
                  const isCurrent = summary.id === project.id;
                  const isSwitching = switchingId === summary.id;

                  return (
                    <button
                      key={summary.id}
                      type="button"
                      onClick={() => handleSwitchProject(summary)}
                      disabled={isCurrent || switchingId !== null}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${
                        isCurrent ? "bg-blue-50 text-blue-700" : "text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {summary.name}
                        <span className="ml-1.5 text-xs text-zinc-400">
                          업무 {summary.workItemCount}개
                        </span>
                      </span>
                      {isCurrent ? (
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          현재
                        </span>
                      ) : isSwitching ? (
                        <span className="shrink-0 text-xs text-zinc-400">전환 중...</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            {switchError && <p className="text-xs text-red-600">{switchError}</p>}

            <button
              type="button"
              onClick={openCreateProjectDialog}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-600 hover:border-blue-400 hover:text-blue-600"
            >
              <span aria-hidden>+</span> 새 프로젝트 만들기
            </button>
          </div>

          <div className="space-y-4 border-t border-zinc-200 pt-5">
            <h3 className="text-sm font-semibold text-zinc-900">현재 프로젝트 설정</h3>

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

            {settingsError && <p className="text-xs text-red-600">{settingsError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                저장
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-zinc-200 pt-5">
            <h3 className="text-sm font-semibold text-zinc-900">데이터 관리</h3>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="w-full rounded-md border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? "내보내는 중..." : "Excel 내보내기"}
            </button>
            {exportError && <p className="text-xs text-red-600">{exportError}</p>}

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="w-full rounded-md border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting ? "분석 중..." : "Excel 가져오기"}
            </button>
            {importError && <p className="text-xs text-red-600">{importError}</p>}
          </div>
        </div>
      </div>

      {createDefaults && (
        <MobileCreateProjectDialog
          defaultName="새 프로젝트"
          defaultTimelineStart={createDefaults.timelineStart}
          defaultTimelineEnd={createDefaults.timelineEnd}
          onCreate={handleCreateProject}
          onCancel={() => setCreateDefaults(null)}
        />
      )}

      {pendingImport && diffCounts && checkpointDiffCounts && (
        <MobileConfirmDialog
          title="가져온 내용으로 덮어쓸까요?"
          description={`업무: 추가 ${diffCounts.added} · 수정 ${diffCounts.modified} · 삭제 ${diffCounts.deleted}\n체크포인트: 추가 ${checkpointDiffCounts.added} · 수정 ${checkpointDiffCounts.modified} · 삭제 ${checkpointDiffCounts.deleted}\n\n삭제되는 항목은 되돌릴 수 없습니다.`}
          confirmLabel="덮어쓰기"
          danger
          onConfirm={confirmImport}
          onCancel={cancelImport}
        />
      )}
    </div>
  );
}
