"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMobileProject } from "@/components/mobile/use-mobile-project";
import { MobileProjectManagementSheet } from "@/components/mobile/mobile-project-management-sheet";
import { MobileGuideSheet } from "@/components/mobile/mobile-guide-sheet";
import { MobileMenuSheet } from "@/components/mobile/mobile-menu-sheet";
import { AiPanel } from "@/components/ai/ai-panel";
import { FeedbackReportModal } from "@/components/feedback/feedback-report-modal";
import { trackEvent } from "@/lib/analytics";

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
    </svg>
  );
}

export default function MobileTabsLayout({ children }: { children: ReactNode }) {
  const {
    project,
    updateWorkItems,
    undo,
    redo,
    canUndo,
    canRedo,
    updateProjectSettings,
    switchToProject,
  } = useMobileProject();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProjectManagementOpen, setIsProjectManagementOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const tabs = [
    { href: "/m", label: "목록", active: pathname === "/m" },
    { href: "/m/timeline", label: "타임라인", active: pathname === "/m/timeline" },
  ];

  const openFeedback = () => {
    trackEvent({ eventType: "feedback_open", projectId: project.id });
    setIsFeedbackOpen(true);
  };

  return (
    <div className="flex h-dvh flex-col bg-white">
      {/* Header 1: 로고 전용 영역 + 우측 메뉴 버튼. 그리드 양쪽 트랙이
          항상 동일 폭이라 버튼 유무와 무관하게 로고는 항상 정중앙 유지. */}
      <div className="grid h-[72px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-zinc-100 px-4">
        <div />
        <Image
          src="/logo.svg"
          alt="TO-DO-LINE"
          width={96}
          height={27}
          priority
          className="h-8 w-auto justify-self-center"
        />
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          aria-label="메뉴 열기"
          className="flex h-9 w-9 items-center justify-center justify-self-end rounded-md text-zinc-700 hover:bg-zinc-100"
        >
          <HamburgerIcon />
        </button>
      </div>

      {/* Header 2: 프로젝트 정보 + Undo/Redo */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsProjectManagementOpen(true)}
          className="min-w-0 flex-1 text-left"
        >
          <h1 className="truncate text-base font-semibold text-zinc-900">{project.name}</h1>
          <p className="truncate text-xs text-zinc-500">
            {project.timelineStart} ~ {project.timelineEnd}
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            aria-label="실행 취소"
            title="실행 취소"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300 disabled:hover:bg-transparent"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            aria-label="다시 실행"
            title="다시 실행"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300 disabled:hover:bg-transparent"
          >
            <RedoIcon />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">{children}</div>

      <nav className="flex shrink-0 border-t border-zinc-200">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 py-3 text-center text-sm font-medium ${
              tab.active ? "text-blue-600" : "text-zinc-500"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/*
        AiPanel의 플로팅 버튼(fixed bottom-20 right-6, h-11)은 컴포넌트 내부에
        고정돼 있어 위치를 바꿀 수 없다(PC 코드 수정 금지). AI 오른쪽에
        44px 버튼 + 12px 여백을 더 넣으려면 56px가 필요하지만 화면 끝까지
        남은 공간은 24px뿐이라 같은 쪽에 나란히 배치할 수 없다. 도움말
        버튼은 반대편(화면 왼쪽 하단, AI와 같은 높이)에 대칭 배치한다 —
        둘 다 44px 동일 크기, 서로/탭바와 절대 겹치지 않음.
      */}
      <button
        type="button"
        onClick={() => setIsGuideOpen(true)}
        aria-label="사용법 보기"
        className="fixed bottom-20 left-6 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-base font-semibold text-white shadow-lg active:scale-90"
      >
        ?
      </button>

      <AiPanel
        project={project}
        updateWorkItems={updateWorkItems}
        onJumpToWorkItem={(id) => router.push(`/m/schedule/${id}`)}
        isDetailPanelOpen={false}
        onSignificantSuccess={() => {}}
      />

      {isMenuOpen && (
        <MobileMenuSheet
          onClose={() => setIsMenuOpen(false)}
          onOpenProjectManagement={() => setIsProjectManagementOpen(true)}
          onOpenFeedback={openFeedback}
        />
      )}

      {isProjectManagementOpen && (
        <MobileProjectManagementSheet
          project={project}
          onSaveSettings={updateProjectSettings}
          onSwitchProject={switchToProject}
          onClose={() => setIsProjectManagementOpen(false)}
        />
      )}

      {isGuideOpen && <MobileGuideSheet onClose={() => setIsGuideOpen(false)} />}

      {/*
        FeedbackReportModal(PC와 공용, 수정 금지)의 오버레이는 z-10으로
        AI/도움말 FAB와 같아서 DOM 순서로 스택이 정해진다. FAB들보다 뒤에
        렌더링해 항상 위에 뜨도록 한다.
      */}
      {isFeedbackOpen && (
        <FeedbackReportModal
          isOpen={isFeedbackOpen}
          onClose={() => setIsFeedbackOpen(false)}
          projectId={project.id}
        />
      )}
    </div>
  );
}
