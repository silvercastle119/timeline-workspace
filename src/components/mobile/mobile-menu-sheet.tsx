"use client";

import { useEffect } from "react";

type MobileMenuSheetProps = {
  onClose: () => void;
  onOpenProjectManagement: () => void;
  onOpenFeedback: () => void;
};

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function MobileMenuSheet({
  onClose,
  onOpenProjectManagement,
  onOpenFeedback,
}: MobileMenuSheetProps) {
  // 뒤로가기(제스처/하드웨어)로도 메뉴가 닫히도록 한다. 저장할 상태가
  // 없는 단순 메뉴라 확인 절차 없이 즉시 닫기만 하면 된다.
  useEffect(() => {
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xs overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">메뉴</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            ✕
          </button>
        </div>

        <div className="p-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenProjectManagement();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <FolderIcon />
            프로젝트 관리
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFeedback();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <FeedbackIcon />
            오류 신고 및 개선 제안
          </button>
        </div>
      </div>
    </div>
  );
}
