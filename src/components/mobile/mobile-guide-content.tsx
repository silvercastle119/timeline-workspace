"use client";

// 모바일(/m) 전용 도움말 콘텐츠. PC(src/app/page.tsx)의 GuideKbd/GuideExample/
// GuideNote/GuideFaqSection 컴포넌트 구조는 재사용하되, 각 탭의 실제 문구는
// 모바일 화면 구성에 맞춰 작성했다. 길이를 줄이기 위해 관련 있는 항목은
// 하나의 단계로 묶고, 문장은 짧게 유지했다.

import { useState, type ReactNode } from "react";

type GuideStepContent = {
  number: string;
  title: string;
  body: ReactNode;
};

export function GuideKbd({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-700 shadow-sm">
      {children}
    </span>
  );
}

export function GuideExample({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-1.5 overflow-x-auto whitespace-pre rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-600">
      {children}
    </pre>
  );
}

export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
      {children}
    </div>
  );
}

// 실제 화면의 버튼/아이콘 위치를 가리키는 작은 배지. 명시적으로 아이콘이
// 지정된 자리에만 사용한다.
function GuideIconChip({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-zinc-50 px-1 align-middle text-sm leading-none text-zinc-700">
      {children}
    </span>
  );
}

function ToggleGlyph() {
  return (
    <svg viewBox="0 0 24 14" className="h-3.5 w-6">
      <rect x="1" y="1" width="22" height="12" rx="6" className="fill-zinc-200 stroke-zinc-400" strokeWidth="1" />
      <circle cx="17" cy="7" r="5" className="fill-blue-600" />
    </svg>
  );
}

function LongPressGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function ChevronGlyph() {
  return <span className="text-xs text-zinc-500">▾ / ▸</span>;
}

export const GUIDE_TABS = ["전체 설명", "요약 설명", "자주 묻는 질문"] as const;

export const GUIDE_FULL_STEPS: GuideStepContent[] = [
  {
    number: "01",
    title: "서비스는 어떻게 구성되어 있나요?",
    body: (
      <>
        <p>
          프로젝트 안에서 여러 업무를 만들고, 업무 간의 관계와 일정을 확인·관리하는
          서비스입니다.
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li><b className="text-zinc-900">목록</b>: 업무 구조와 상세 정보 관리</li>
          <li><b className="text-zinc-900">Timeline</b>: 전체 업무 일정 확인</li>
          <li><b className="text-zinc-900">프로젝트 관리</b>: 프로젝트·데이터 관리</li>
        </ul>
      </>
    ),
  },
  {
    number: "02",
    title: "목록에서 업무 확인·추가·이동하기",
    body: (
      <>
        <p>
          하단 <b className="text-zinc-900">목록</b> 탭에서 업무 구조를
          확인합니다. <GuideIconChip><ChevronGlyph /></GuideIconChip>로
          하위 업무를 펼치거나 접을 수 있습니다.
        </p>
        <p>
          목록 맨 아래 <GuideIconChip>+</GuideIconChip> 버튼으로 업무를
          추가하면(최상위로 생성) 상세 화면으로 바로 이동합니다.
        </p>
        <p>
          업무를 <GuideIconChip><LongPressGlyph /></GuideIconChip> 길게 눌러
          끌면 순서를 바꾸거나 다른 업무의 하위로 옮길 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "03",
    title: "업무 상세에서 관리할 수 있는 항목",
    body: (
      <>
        <p>업무를 탭하면 상세 화면에서 다음을 관리합니다.</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <GuideIconChip><ToggleGlyph /></GuideIconChip>{" "}
            <b className="text-zinc-900">활성 상태</b> — 끄면 목록·Timeline에
            흐리게 표시되고 Excel에서도 제외됩니다.
          </li>
          <li>
            <GuideIconChip>✎</GuideIconChip> <b className="text-zinc-900">업무명</b>
          </li>
          <li>
            <GuideIconChip>📅</GuideIconChip> <b className="text-zinc-900">일정</b>(시작일/종료일).{" "}
            날짜가 정해지지 않았다면 <GuideKbd>일정 미정</GuideKbd>으로 둘 수 있습니다.
          </li>
          <li>
            <GuideIconChip>🎨</GuideIconChip> <b className="text-zinc-900">색상</b>
          </li>
          <li>
            <GuideIconChip>📌</GuideIconChip> <b className="text-zinc-900">체크포인트</b>와{" "}
            <b className="text-zinc-900">메모</b>
          </li>
        </ul>
        <p>
          수정 후 <GuideIconChip>✓</GuideIconChip> 저장을 눌러야 반영되고,{" "}
          <GuideIconChip>✕</GuideIconChip> 취소를 누르면 되돌아갑니다.
          저장하지 않고 나가려 하면 확인창이 뜹니다.
        </p>
      </>
    ),
  },
  {
    number: "04",
    title: "하위 일정 자동 반영",
    body: (
      <>
        <p>
          상위 업무에서 <GuideKbd>하위 일정 자동 반영</GuideKbd>을 켜면 하위
          업무 중 가장 이른 시작일 ~ 가장 늦은 종료일이 상위 업무 일정으로
          자동 반영됩니다.
        </p>
        <GuideExample>{`디자인 (자동 반영 ON)   09.08 ~ 10.02
 ├─ 메인 페이지 디자인   09.08 ~ 09.18
 ├─ 서브 페이지 디자인   09.15 ~ 09.25
 └─ 모바일 디자인        09.22 ~ 10.02`}</GuideExample>
        <p>Timeline에서도 이 기간이 상위 업무 막대에 그대로 표시됩니다.</p>
      </>
    ),
  },
  {
    number: "05",
    title: "Timeline에서 전체 일정 확인하기",
    body: (
      <>
        <p>
          하단 <b className="text-zinc-900">Timeline</b> 탭에서 모든 업무의
          일정을 위계 구조 그대로, 월/일 눈금과 함께 확인합니다.
        </p>
        <p>
          업무 시작·종료 시점, 겹치는 일정, 전체 흐름을 한눈에 파악할 수
          있습니다. <GuideIconChip>↔</GuideIconChip> 좌우로 스크롤해 전체
          기간을 볼 수 있고, 막대를 탭하면 해당 업무 상세로 이동합니다.
        </p>
      </>
    ),
  },
  {
    number: "06",
    title: "저장 · 취소 · 실행취소",
    body: (
      <>
        <p>
          업무 상세에서 <GuideIconChip>✓</GuideIconChip>저장 /{" "}
          <GuideIconChip>✕</GuideIconChip>취소로 변경을 반영하거나 되돌립니다.
        </p>
        <p>
          화면 상단의 <GuideIconChip>↶</GuideIconChip>실행취소 /{" "}
          <GuideIconChip>↷</GuideIconChip>다시실행으로 최근 작업을 되돌리거나
          다시 적용할 수 있습니다. 단, Excel 가져오기나 프로젝트 전환은
          되돌릴 수 없습니다.
        </p>
      </>
    ),
  },
  {
    number: "07",
    title: "프로젝트 관리",
    body: (
      <>
        <p>
          <GuideIconChip>☰</GuideIconChip> 메뉴 → 프로젝트 관리에서 다음을
          이용합니다.
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <GuideIconChip>📁</GuideIconChip> 내 프로젝트 — 다른 프로젝트로 전환
          </li>
          <li>프로젝트명 / 전체 Timeline 기간 변경</li>
          <li>
            <GuideIconChip>📤</GuideIconChip>Excel 내보내기 /{" "}
            <GuideIconChip>📥</GuideIconChip>Excel 가져오기
          </li>
        </ul>
      </>
    ),
  },
  {
    number: "08",
    title: "AI · 도움말",
    body: (
      <>
        <p>
          화면 하단의 <GuideIconChip>✨</GuideIconChip> AI 버튼으로 일정 자동
          채우기·프로젝트 검토 기능을, <GuideIconChip>?</GuideIconChip> 도움말
          버튼으로 이 화면을 언제든 열 수 있습니다.
        </p>
      </>
    ),
  },
];

export const GUIDE_SUMMARY_STEPS: GuideStepContent[] = [
  {
    number: "01",
    title: "목록",
    body: (
      <>
        업무 확인·추가(<GuideIconChip>+</GuideIconChip>)·펼치기/접기(
        <GuideIconChip><ChevronGlyph /></GuideIconChip>). 길게 눌러(
        <GuideIconChip><LongPressGlyph /></GuideIconChip>) 이동.
      </>
    ),
  },
  {
    number: "02",
    title: "업무 상세",
    body: (
      <>
        활성·업무명·일정(일정 미정/하위 일정 자동 반영)·색상·체크포인트·메모 수정 후{" "}
        <GuideIconChip>✓</GuideIconChip> 저장.
      </>
    ),
  },
  {
    number: "03",
    title: "Timeline",
    body: <>전체 업무 일정을 막대로 확인, <GuideIconChip>↔</GuideIconChip> 좌우 스크롤.</>,
  },
  {
    number: "04",
    title: "프로젝트 관리",
    body: (
      <>
        <GuideIconChip>☰</GuideIconChip> 메뉴에서 프로젝트 전환·설정 변경·
        Excel 가져오기/내보내기.
      </>
    ),
  },
  {
    number: "05",
    title: "AI / 도움말",
    body: (
      <>
        <GuideIconChip>✨</GuideIconChip> AI, <GuideIconChip>?</GuideIconChip> 도움말 — 화면 하단 버튼.
      </>
    ),
  },
];

type GuideFaqItem = {
  question: string;
  answer: ReactNode;
};

export const GUIDE_FAQ_ITEMS: GuideFaqItem[] = [
  {
    question: "비활성 업무는 어떻게 되나요?",
    answer: (
      <p>
        삭제되는 것이 아니라 활성 상태만 꺼집니다. 목록·Timeline에서 흐리게
        표시되고, Excel로 내보낼 때도 포함되지 않습니다.
      </p>
    ),
  },
  {
    question: "업무를 삭제하면 되돌릴 수 있나요?",
    answer: <p>삭제 전 확인창이 표시되며, 삭제 후에는 되돌릴 수 없습니다.</p>,
  },
  {
    question: "체크포인트는 무엇인가요?",
    answer: (
      <p>
        업무 일정 중 중요한 날짜를 별도로 표시해두는 기능입니다. 마감일이나
        진행 시점을 기록할 때 사용합니다.
      </p>
    ),
  },
  {
    question: "하위 일정 반영을 켜면 Timeline에서는 어떻게 보이나요?",
    answer: (
      <p>
        하위 업무 중 가장 이른 시작일 ~ 가장 늦은 종료일이 상위 업무의
        Timeline 막대에 그대로 반영됩니다. 하위 일정을 바꾸면 상위 막대도
        함께 바뀝니다.
      </p>
    ),
  },
  {
    question: "업무의 위치나 그룹을 바꾸고 싶어요.",
    answer: (
      <p>
        목록에서 업무를{" "}
        <GuideIconChip><LongPressGlyph /></GuideIconChip> 길게 눌러 끕니다.
        대상 행의 위/아래 가장자리에 놓으면 순서만 바뀌고, 가운데에 놓으면
        그 업무의 하위로 이동합니다. 목록 왼쪽 끝에 놓으면 최상위로 이동합니다.
      </p>
    ),
  },
  {
    question: "Excel 가져오기/내보내기 시 주의할 점이 있나요?",
    answer: (
      <>
        <p>
          <b className="text-zinc-900">
            반드시 이 서비스에서 내보낸 Excel 파일의 양식을 그대로 사용해야
            합니다.
          </b>{" "}
          임의로 만든 파일이나 형식을 바꾼 파일은 정상적으로 처리되지 않을 수
          있습니다.
        </p>
        <p>
          내보낸 파일에서 날짜·색상·이름·메모·체크포인트·순서·추가삭제를
          수정해 다시 가져올 수 있으며, 적용 전에 변경 내용을 확인할 수
          있습니다.
        </p>
      </>
    ),
  },
  {
    question: "여러 업무를 한 번에 수정하려면 어떻게 하나요?",
    answer: (
      <p>
        Excel로 내보내 필요한 내용을 수정한 뒤 다시 가져오면 여러 업무를 한
        번에 관리할 수 있습니다.
      </p>
    ),
  },
  {
    question: "일정 정보를 서비스 운영 측에서 볼 수 있나요?",
    answer: (
      <p>
        아니요. 프로젝트 데이터는 서버로 전송되지 않고 브라우저 로컬 저장소
        (IndexedDB)에만 저장됩니다.
      </p>
    ),
  },
  {
    question: "여러 프로젝트를 사용할 수 있나요?",
    answer: (
      <p>
        네. <GuideIconChip>☰</GuideIconChip> 메뉴 → 프로젝트 관리 → 내
        프로젝트에서 저장된 프로젝트를 확인하고 전환할 수 있습니다.
      </p>
    ),
  },
  {
    question: "AI 기능은 어디에서 사용할 수 있나요?",
    answer: <p>화면 하단의 <GuideIconChip>✨</GuideIconChip> AI 버튼을 누르면 됩니다.</p>,
  },
];

export function GuideFaqSection({ items }: { items: GuideFaqItem[] }) {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setOpenIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200">
      {items.map((item, index) => {
        const isOpen = openIndexes.has(index);

        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => toggle(index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
            >
              <span>{item.question}</span>
              <span
                className={`shrink-0 text-zinc-400 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>
            {isOpen && (
              <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-zinc-700">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
