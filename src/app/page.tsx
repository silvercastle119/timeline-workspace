"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  addDays,
  getDatesInRange,
  getDaysBetween,
  getTimelineDuration,
  getTimelineOffset,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/lib/timeline/date-utils";
import {
  getMaxTimelineEndDate,
  validateTimelineRange,
} from "@/lib/timeline/timeline-validation";
import { useHistoryState } from "@/lib/history/use-history-state";
import {
  deleteProject,
  listProjectSummaries,
  loadCurrentProject,
  loadProjectById,
  saveProject,
  setCurrentProjectId,
  type StoredProjectSummary,
} from "@/lib/persistence/indexed-db";
import {
  DEFAULT_BAR_COLOR,
  DEFAULT_COLOR_PALETTE,
  darkenColor,
} from "@/lib/work-items/color-utils";
import {
  clampCheckpointsToRange,
  computeSiblingOrder,
  createWorkItem,
  getAggregateColorSegments,
  getDescendantWorkItemIds,
  getDisplayTimelines,
  getEffectiveWorkItemTimelines,
  getInactiveSubtreeIds,
  getNextSiblingOrder,
  getWorkItemDisplayRows,
  needsRebalance,
  rebalanceSiblingOrders,
  sanitizeAutoTimelineFlags,
  type WorkItemTimeline,
} from "@/lib/work-items/tree-utils";
import type { Checkpoint, Project, WorkItem } from "@/types/project";
import type { ImportDiff, ImportDiffEntry } from "@/lib/export/excel-import";
import { AiPanel } from "@/components/ai/ai-panel";
import { trackEvent } from "@/lib/analytics";
import { SatisfactionSurveyModal } from "@/components/survey/satisfaction-survey-modal";
import { canShowSurvey } from "@/lib/survey/survey-visibility";
import { MobileOptimizedNotice } from "@/components/mobile/mobile-optimized-notice";
import { FeedbackReportModal } from "@/components/feedback/feedback-report-modal";

const DEFAULT_DAY_WIDTH = 40;
const MIN_DAY_WIDTH = 20;
const MAX_DAY_WIDTH = 96;
const MIN_MOVE_WIDTH = 12;
const TREE_HOLD_MS = 350;
const TREE_MOVE_PX = 6;
const BAR_CLICK_MOVE_PX = 4;
const ROOT_ZONE_PX = 24;
const AUTO_UNDECIDED_MEMO = "일정 미정";

type GuideStepContent = {
  number: string;
  title: string;
  body: ReactNode;
};

function GuideKbd({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-700 shadow-sm">
      {children}
    </span>
  );
}

function GuideExample({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-1.5 overflow-x-auto whitespace-pre rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-600">
      {children}
    </pre>
  );
}

function GuideNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
      {children}
    </div>
  );
}

const GUIDE_TABS = ["전체 설명", "요약 설명", "자주 묻는 질문"] as const;

const GUIDE_FULL_STEPS: GuideStepContent[] = [
  {
    number: "01",
    title: "프로젝트를 시작하세요",
    body: (
      <>
        <p>
          <b className="text-zinc-900">프로젝트명 설정</b>
          <br />
          화면 왼쪽 상단의 <b className="text-zinc-900">프로젝트명 옆</b>{" "}
          <GuideKbd>✎</GuideKbd> <b className="text-zinc-900">아이콘</b>을
          클릭하여 프로젝트명을 설정합니다.
        </p>
        <p>
          <b className="text-zinc-900">전체 Timeline 설정</b>
          <br />
          프로젝트명 아래 <GuideKbd>Timeline:</GuideKbd>{" "}
          <b className="text-zinc-900">옆</b> <GuideKbd>✎</GuideKbd>{" "}
          <b className="text-zinc-900">아이콘</b>을 클릭하여 프로젝트가
          진행되는 전체 기간을 설정합니다.
        </p>
        <p>설정한 기간이 화면 상단 Timeline의 전체 범위가 됩니다.</p>
      </>
    ),
  },
  {
    number: "02",
    title: "프로젝트의 업무 구조를 입력하세요",
    body: (
      <>
        <p>
          화면 <b className="text-zinc-900">왼쪽 하단의</b>{" "}
          <GuideKbd>+ 항목 추가</GuideKbd> <b className="text-zinc-900">버튼</b>
          을 클릭하여 프로젝트에서 진행할 주요 업무를 구성합니다.
        </p>
        <p>예를 들어 홈페이지 리뉴얼 프로젝트라면:</p>
        <GuideExample>{`기획
디자인
개발
콘텐츠 제작
QA
오픈`}</GuideExample>
        <p>과 같이 프로젝트의 주요 업무를 입력할 수 있습니다.</p>
        <p>
          이 단계에서는 각각의 업무에 세부 일정을 입력하기보다,{" "}
          <b className="text-zinc-900">
            프로젝트에서 어떤 업무를 어떤 구조로 진행할 것인지 구성하는 것
          </b>
          에 집중합니다.
        </p>
      </>
    ),
  },
  {
    number: "03",
    title: "각 업무의 세부 업무를 추가하세요",
    body: (
      <>
        <p>
          먼저 <b className="text-zinc-900">왼쪽 Work Items에서 세부 업무를 추가할 상위 업무를 클릭</b>합니다.
        </p>
        <p>그러면 오른쪽에 Work Item 상세 패널이 열립니다.</p>
        <p>
          상세 패널 하단의 <GuideKbd>+ 하위 항목 추가</GuideKbd>{" "}
          <b className="text-zinc-900">버튼</b>을 클릭하여 필요한 세부 업무를
          추가합니다.
        </p>
        <p>
          예를 들어 <GuideKbd>디자인</GuideKbd>을 선택했다면:
        </p>
        <GuideExample>{`디자인
 ├─ 메인 페이지 디자인
 ├─ 서브 페이지 디자인
 └─ 모바일 디자인`}</GuideExample>
        <p>처럼 구성할 수 있습니다.</p>
        <p>
          같은 방법으로 <GuideKbd>개발</GuideKbd>을 선택하여:
        </p>
        <GuideExample>{`개발
 ├─ 프론트엔드 개발
 ├─ CMS 연동
 └─ 반응형 대응`}</GuideExample>
        <p>과 같이 세부 업무를 추가할 수 있습니다.</p>
        <p>즉,</p>
        <GuideNote>
          <b className="text-zinc-900">상위 업무 클릭 → 우측 상세 패널 →{" "}
          <GuideKbd>+ 하위 항목 추가</GuideKbd></b>
        </GuideNote>
        <p>순서로 세부 업무를 추가합니다.</p>
      </>
    ),
  },
  {
    number: "04",
    title: "각 업무의 일정을 설정하세요",
    body: (
      <>
        <p>일정을 입력할 Work Item을 클릭합니다.</p>
        <p>
          오른쪽 상세 패널에서 <GuideKbd>시작일</GuideKbd>과{" "}
          <GuideKbd>종료일</GuideKbd>을 설정합니다.
        </p>
        <p>입력한 일정은 Timeline에 막대로 표시됩니다.</p>
      </>
    ),
  },
  {
    number: "05",
    title: "Timeline의 막대를 직접 조정하세요",
    body: (
      <>
        <p>
          Timeline에 표시된 일정 막대를 직접 드래그하여 일정을 조정할 수
          있습니다.
        </p>
        <p>
          <b className="text-zinc-900">막대 전체를 이동하기</b>
          <br />
          막대의 가운데 부분을 잡고 드래그하면{" "}
          <b className="text-zinc-900">업무의 시작일과 종료일을 함께 이동</b>
          할 수 있습니다.
        </p>
        <p>
          <b className="text-zinc-900">업무 기간을 늘리거나 줄이기</b>
          <br />
          막대의 <b className="text-zinc-900">왼쪽 또는 오른쪽 끝부분을 잡고 드래그</b>
          하면 업무 기간을 조정할 수 있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li>왼쪽 끝 → 시작일 변경</li>
          <li>오른쪽 끝 → 종료일 변경</li>
        </ul>
        <p>
          따라서 날짜를 직접 입력하지 않아도 Timeline을 보면서 업무의 위치와
          기간을 직관적으로 조정할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "06",
    title: "하위 일정 자동 반영을 사용하세요",
    body: (
      <>
        <p>
          상위 업무의 상세 패널에서 <GuideKbd>하위 일정 자동 반영</GuideKbd>{" "}
          체크박스를 선택하면 하위 업무의 일정에 따라 상위 업무의 일정이
          반영됩니다.
        </p>
        <p>예를 들어:</p>
        <GuideExample>{`디자인
 ├─ 메인 페이지 디자인   09.08 ~ 09.18
 ├─ 서브 페이지 디자인   09.15 ~ 09.25
 └─ 모바일 디자인        09.22 ~ 10.02`}</GuideExample>
        <p>
          이 경우 가장 먼저 시작하는 하위 업무가 <b className="text-zinc-900">09.08</b>,
          가장 늦게 끝나는 하위 업무가 <b className="text-zinc-900">10.02</b>이므로,
        </p>
        <GuideNote>
          <b className="text-zinc-900">디자인: 09.08 ~ 10.02</b>
        </GuideNote>
        <p>로 상위 업무의 일정이 자동으로 반영됩니다.</p>
        <p>
          즉, <b className="text-zinc-900">상위 업무의 시작일은 하위 업무 중 가장 이른 시작일</b>,{" "}
          <b className="text-zinc-900">종료일은 가장 늦은 종료일</b>을 기준으로
          설정됩니다.
        </p>
        <p>
          이를 통해 하위 업무의 일정만 관리해도 상위 업무가 차지하는{" "}
          <b className="text-zinc-900">전체 작업 기간을 자동으로 확인</b>할 수
          있습니다.
        </p>
      </>
    ),
  },
  {
    number: "07",
    title: "일정이 정해지지 않은 업무는 '일정 미정'으로 관리하세요",
    body: (
      <>
        <p>
          아직 일정이 확정되지 않은 업무는 날짜를 입력하지 않고{" "}
          <GuideKbd>일정 미정</GuideKbd>으로 관리할 수 있습니다.
        </p>
        <p>
          해당 Work Item을 클릭한 뒤 우측 상세 패널의{" "}
          <GuideKbd>일정 미정</GuideKbd> <b className="text-zinc-900">체크박스</b>
          를 선택합니다.
        </p>
        <p>
          업무 구조에는 포함하면서 일정이 아직 확정되지 않은 업무를 별도로
          관리할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "08",
    title: "전체적인 프로젝트 흐름을 확인하세요",
    body: (
      <>
        <p>
          업무와 일정을 모두 입력했다면 Timeline을 통해 프로젝트 전체 흐름을
          확인합니다.
        </p>
        <p>
          왼쪽에서는 <b className="text-zinc-900">업무의 구조와 위계</b>를,
          오른쪽에서는 <b className="text-zinc-900">업무의 시간적 흐름</b>을
          확인할 수 있습니다.
        </p>
        <p>Timeline을 통해 다음과 같은 내용을 한눈에 파악할 수 있습니다.</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>어떤 업무가 언제 시작하고 끝나는지</li>
          <li>어떤 업무가 동시에 진행되는지</li>
          <li>특정 기간에 업무가 집중되어 있는지</li>
          <li>업무가 어떤 순서로 이어지는지</li>
          <li>프로젝트 전체 일정이 적절하게 구성되어 있는지</li>
        </ul>
        <p>
          필요하다면 Timeline의 막대를 다시 드래그하거나 상세 패널에서
          시작일과 종료일을 수정하여 일정을 조정할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "09",
    title: "프로젝트를 Excel로 내보내세요",
    body: (
      <>
        <p>
          프로젝트의 업무와 일정 구성을 완료했다면 화면{" "}
          <b className="text-zinc-900">오른쪽 상단의</b>{" "}
          <GuideKbd>Excel로 내보내기</GuideKbd> <b className="text-zinc-900">버튼</b>을
          클릭합니다.
        </p>
        <p>
          현재 TO-DO-LINE에서 관리하고 있는 프로젝트 데이터를 Excel 파일로
          내보낼 수 있습니다.
        </p>
        <p>
          내보낸 Excel은 프로젝트 자료 보관이나 업무 및 일정 공유 등에 활용할
          수 있습니다.
        </p>
      </>
    ),
  },
];

const GUIDE_SUMMARY_STEPS: GuideStepContent[] = [
  {
    number: "01",
    title: "프로젝트 설정",
    body: (
      <>
        프로젝트명 옆 <GuideKbd>✎</GuideKbd> → 프로젝트명 설정 / Timeline 옆{" "}
        <GuideKbd>✎</GuideKbd> → 전체 기간 설정
      </>
    ),
  },
  {
    number: "02",
    title: "업무 구조 입력",
    body: (
      <>
        왼쪽 하단 <GuideKbd>+ 항목 추가</GuideKbd> → 주요 업무 구성
      </>
    ),
  },
  {
    number: "03",
    title: "세부 업무 추가",
    body: (
      <>
        상위 업무 선택 → 우측 상세 패널 <GuideKbd>+ 하위 항목 추가</GuideKbd>
      </>
    ),
  },
  {
    number: "04",
    title: "일정 설정",
    body: (
      <>
        Work Item 선택 → <GuideKbd>시작일</GuideKbd> /{" "}
        <GuideKbd>종료일</GuideKbd> 설정
      </>
    ),
  },
  {
    number: "05",
    title: "Timeline 조정",
    body: <>막대 전체를 드래그하여 이동하거나 양끝을 드래그하여 기간 조정</>,
  },
  {
    number: "06",
    title: "하위 일정 자동 반영",
    body: (
      <>
        <GuideKbd>하위 일정 자동 반영</GuideKbd> 선택 → 하위 업무 일정에 따라
        상위 업무 일정 반영
      </>
    ),
  },
  {
    number: "07",
    title: "일정 미정",
    body: (
      <>
        <GuideKbd>일정 미정</GuideKbd> 선택 → 아직 날짜가 정해지지 않은 업무
        관리
      </>
    ),
  },
  {
    number: "08",
    title: "전체 흐름 확인",
    body: <>Timeline에서 업무 구조와 시간 흐름 확인</>,
  },
  {
    number: "09",
    title: "Excel Export",
    body: (
      <>
        오른쪽 상단 <GuideKbd>Excel로 내보내기</GuideKbd> 클릭
      </>
    ),
  },
];

type GuideFaqItem = {
  question: string;
  answer: ReactNode;
};

const GUIDE_FAQ_ITEMS: GuideFaqItem[] = [
  {
    question: "여러 막대를 한 번에 수정하려면 어떻게 하나요?",
    answer: (
      <>
        <p>
          여러 업무의 일정이나 정보를 한꺼번에 수정해야 하는 경우 Excel을
          활용할 수 있습니다.
        </p>
        <p>
          TO-DO-LINE에서 <GuideKbd>Excel로 내보내기</GuideKbd>한 뒤 필요한
          내용을 수정하고 <GuideKbd>Excel 불러오기</GuideKbd>로 다시
          가져오는 방식으로 여러 업무의 데이터를 한 번에 관리할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    question: "이미 만든 Excel을 다시 수정하고 싶어요.",
    answer: (
      <>
        <p>
          가장 편리한 방법은 TO-DO-LINE에서 내보낸 Excel의 구조를 그대로
          사용하는 것입니다.
        </p>
        <p>
          기존에 TO-DO-LINE에서 <GuideKbd>Excel로 내보내기</GuideKbd>한
          파일을 열어 필요한 업무나 일정 데이터를 수정한 뒤{" "}
          <GuideKbd>Excel 불러오기</GuideKbd>로 다시 가져오면 됩니다.
        </p>
        <p>
          TO-DO-LINE에서 Export한 Excel은 서비스에서 사용하는 데이터 구조를
          이미 갖추고 있기 때문에, 새로운 Excel 파일을 처음부터 만드는 것보다
          기존 Export 파일을 수정하는 것이 편리합니다.
        </p>
      </>
    ),
  },
  {
    question: "업무의 위치를 바꾸고 싶어요.",
    answer: (
      <>
        <p>
          Work Item의 위치를 변경하여 프로젝트의 업무 구조를 정리할 수
          있습니다.
        </p>
        <p>
          업무의 위치를 변경하면 동일한 그룹 안에서 업무의 순서를 조정하거나,
          다른 그룹으로 업무를 이동할 수 있습니다.
        </p>
        <p>
          왼쪽 Work Items 목록에서 옮기려는 업무를 눌러 원하는 위치로
          드래그합니다. 대상 업무 행의 위쪽에 놓으면 그 업무 위로, 아래쪽에
          놓으면 그 업무 아래로 순서가 바뀝니다. 목록의 왼쪽 가장자리에 놓으면
          해당 업무가 최상위로 이동합니다.
        </p>
      </>
    ),
  },
  {
    question: "업무를 다른 그룹으로 옮기고 싶어요.",
    answer: (
      <>
        <p>업무를 다른 상위 업무 아래로 이동하여 업무의 그룹을 변경할 수 있습니다.</p>
        <p>
          예를 들어 기존에 <GuideKbd>기획</GuideKbd> 아래에 있던 업무를{" "}
          <GuideKbd>디자인</GuideKbd> 아래로 이동하면 해당 업무의 상위 그룹이
          변경됩니다.
        </p>
        <p>
          이동할 업무를 눌러 원하는 상위 업무 행의 가운데 부분에 드래그하여
          놓으면 그 업무의 하위 항목으로 이동합니다. 업무의 위치를 변경할
          때는 대상 행의 위쪽/아래쪽 가장자리(순서만 변경)와 가운데
          (상위 그룹 변경)를 구분해서 놓아야 합니다.
        </p>
      </>
    ),
  },
  {
    question: "일정 정보 데이터를 플랫폼 운영 측에서 열람하나요?",
    answer: (
      <p>
        TO-DO-LINE의 프로젝트 데이터는 별도의 서버로 전송되지 않고, 사용
        중인 브라우저의 로컬 저장소(IndexedDB)에만 저장됩니다. 따라서
        플랫폼 운영 측에서 해당 데이터를 열람할 수 없습니다.
      </p>
    ),
  },
  {
    question: "Timeline에서 업무 일정을 직접 옮길 수 있나요?",
    answer: (
      <p>
        네. Timeline의 일정 막대를 직접 드래그할 수 있습니다. 막대 전체를
        잡고 드래그하면 일정 전체가 이동하고, 막대의 양끝을 잡고 드래그하면
        업무 기간을 늘리거나 줄일 수 있습니다.
      </p>
    ),
  },
  {
    question: "하위 업무의 일정이 상위 업무에 반영되나요?",
    answer: (
      <p>
        상위 업무의 상세 패널에서 <GuideKbd>하위 일정 자동 반영</GuideKbd>을
        선택하면 하위 업무의 일정이 상위 업무에 반영됩니다.
      </p>
    ),
  },
];

function GuideFaqSection({ items }: { items: GuideFaqItem[] }) {
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

const initialWorkItems: WorkItem[] = [
  createWorkItem({
    id: "001",
    name: "디지털마케팅",
    parentId: null,
    order: 1000,
    startDate: "2026-09-01",
    endDate: "2026-09-20",
  }),
  createWorkItem({
    id: "002",
    name: "시장조사",
    parentId: "001",
    order: 1000,
    startDate: "2026-09-01",
    endDate: "2026-09-05",
  }),
  createWorkItem({
    id: "003",
    name: "기획",
    parentId: "001",
    order: 2000,
    startDate: "2026-09-04",
    endDate: "2026-09-12",
  }),
  createWorkItem({
    id: "004",
    name: "디자인",
    parentId: "001",
    order: 3000,
    startDate: "2026-09-10",
    endDate: "2026-09-20",
  }),
];

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createDefaultProject(): Project {
  const timelineStartDate = new Date();
  const timelineStart = getLocalDateString(timelineStartDate);
  const timelineEndDate = new Date(timelineStartDate);
  timelineEndDate.setDate(timelineEndDate.getDate() + 90);

  return {
    id: crypto.randomUUID(),
    name: "새 프로젝트",
    timelineStart,
    timelineEnd: getLocalDateString(timelineEndDate),
    workItems: initialWorkItems,
    customColors: [],
  };
}

function getBarBackground(
  item: WorkItem,
  timeline: WorkItemTimeline,
  workItems: WorkItem[]
): React.CSSProperties {
  if (item.isUndecided) {
    return {
      background:
        "repeating-linear-gradient(45deg, #d4d4d8, #d4d4d8 4px, #f4f4f5 4px, #f4f4f5 8px)",
    };
  }

  if (!item.autoTimeline) {
    return { backgroundColor: item.color ?? DEFAULT_BAR_COLOR };
  }

  const segments = getAggregateColorSegments(workItems, item, timeline);

  if (segments.length === 0) {
    return { backgroundColor: DEFAULT_BAR_COLOR };
  }

  const totalDays = segments.length;
  const stops = segments.flatMap((segment, index) => {
    const startPct = (index / totalDays) * 100;
    const endPct = ((index + 1) / totalDays) * 100;

    return [`${segment.color} ${startPct}%`, `${segment.color} ${endPct}%`];
  });

  return { background: `linear-gradient(to right, ${stops.join(", ")})` };
}

function getResizeHandleWidth(
  startDate: string,
  endDate: string,
  dayWidth: number
) {
  const barWidth = Math.max(
    0,
    getTimelineDuration(startDate, endDate) * dayWidth
  );

  return Math.min(
    dayWidth / 2,
    Math.max(0, (barWidth - MIN_MOVE_WIDTH) / 2)
  );
}

type DropIndicator =
  | { mode: "root" }
  | { mode: "child" | "before" | "after"; targetItemId: string };

function computeDropIndicator(
  workItems: WorkItem[],
  draggedItemId: string,
  clientX: number,
  clientY: number,
  panelRect: DOMRect | null
): DropIndicator | null {
  if (panelRect && clientX - panelRect.left < ROOT_ZONE_PX) {
    return { mode: "root" };
  }

  const target = document.elementFromPoint(clientX, clientY);
  const rowElement = target?.closest<HTMLElement>("[data-row-id]");

  if (!rowElement) return null;

  const targetItemId = rowElement.dataset.rowId as string;
  const invalidTargetIds = getDescendantWorkItemIds(workItems, draggedItemId);
  invalidTargetIds.add(draggedItemId);

  if (invalidTargetIds.has(targetItemId)) return null;

  const rect = rowElement.getBoundingClientRect();
  const ratio = (clientY - rect.top) / rect.height;

  if (ratio < 0.25) return { mode: "before", targetItemId };
  if (ratio > 0.75) return { mode: "after", targetItemId };

  return { mode: "child", targetItemId };
}

type BarDragAction = "move" | "resize-start" | "resize-end";

type BarDragOriginal = {
  itemId: string;
  startDate: string;
  endDate: string;
  checkpoints: Checkpoint[];
};

type BarDragState = {
  action: BarDragAction;
  startX: number;
  primaryItemId: string;
  originals: BarDragOriginal[];
};

/**
 * Resolves which work items move together for a bar drag/resize: when the
 * pressed bar is part of a multi-selection, every other selected,
 * date-editable bar moves with it by the same offset; otherwise just the
 * pressed bar moves alone.
 */
function getDragGroupItems(
  pressedItemId: string,
  selectedItemIds: Set<string>,
  workItems: WorkItem[]
): WorkItem[] {
  const candidateIds =
    selectedItemIds.has(pressedItemId) && selectedItemIds.size > 1
      ? selectedItemIds
      : new Set([pressedItemId]);

  return workItems.filter(
    (item) =>
      candidateIds.has(item.id) &&
      !item.autoTimeline &&
      !item.isUndecided &&
      item.startDate &&
      item.endDate
  );
}

function computeGroupDraggedDates(
  dragState: BarDragState,
  clientX: number,
  dayWidth: number,
  timelineStart: string,
  timelineEnd: string
): Map<string, { startDate: string; endDate: string }> | null {
  const deltaX = clientX - dragState.startX;
  const rawDaysMoved = Math.round(deltaX / dayWidth);

  let groupMin = -Infinity;
  let groupMax = Infinity;

  dragState.originals.forEach(({ startDate, endDate }) => {
    let itemMin: number;
    let itemMax: number;

    if (dragState.action === "resize-start") {
      itemMin = getDaysBetween(startDate, timelineStart);
      itemMax = getDaysBetween(startDate, addDays(endDate, -1));
    } else if (dragState.action === "resize-end") {
      itemMin = getDaysBetween(endDate, addDays(startDate, 1));
      itemMax = getDaysBetween(endDate, timelineEnd);
    } else {
      itemMin = getDaysBetween(startDate, timelineStart);
      itemMax = getDaysBetween(endDate, timelineEnd);
    }

    groupMin = Math.max(groupMin, itemMin);
    groupMax = Math.min(groupMax, itemMax);
  });

  if (groupMin > groupMax) {
    if (dragState.action === "move") return null;
    groupMax = groupMin;
  }

  const boundedDaysMoved = Math.min(
    groupMax,
    Math.max(groupMin, rawDaysMoved)
  );

  const updates = new Map<string, { startDate: string; endDate: string }>();

  dragState.originals.forEach(({ itemId, startDate, endDate }) => {
    if (dragState.action === "resize-start") {
      updates.set(itemId, {
        startDate: addDays(startDate, boundedDaysMoved),
        endDate,
      });
    } else if (dragState.action === "resize-end") {
      updates.set(itemId, {
        startDate,
        endDate: addDays(endDate, boundedDaysMoved),
      });
    } else {
      updates.set(itemId, {
        startDate: addDays(startDate, boundedDaysMoved),
        endDate: addDays(endDate, boundedDaysMoved),
      });
    }
  });

  return updates;
}

export default function Home() {
  const {
    state: project,
    setState: setProject,
    setStateTransient: setProjectTransient,
    commitHistory,
    resetState: resetProjectHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistoryState<Project>(createDefaultProject);
  const dragSnapshotRef = useRef<Project | null>(null);
  // Analytics: dedupes project_open so switching to the same project twice
  // (or an effect re-running under StrictMode) doesn't double-fire it.
  const lastOpenedProjectIdRef = useRef<string | null>(null);
  // Analytics: bundles every field edit made while a Work Item's Detail
  // Panel is open into a single item_change, fired once when the panel
  // closes (selection moves elsewhere) — only if something actually changed.
  const pendingItemChangeRef = useRef<{ itemId: string; hasChange: boolean } | null>(
    null
  );
  const colorPickerSnapshotRef = useRef<Project | null>(null);
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Project | null>(null);
  const [pendingImportDiff, setPendingImportDiff] = useState<ImportDiff | null>(null);
  const [isOverwritePreviewOpen, setIsOverwritePreviewOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isGuideClosing, setIsGuideClosing] = useState(false);
  const guideCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const guideSectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  // Opens SatisfactionSurvey after a meaningful trigger (AI success + panel
  // close, Excel import/export success) — but only if the re-show cooldown
  // has elapsed, and never twice for one trigger (dedupe via the functional
  // update: if it's already open, this is a no-op).
  const maybeShowSurvey = useCallback(() => {
    setIsSurveyOpen((current) => current || canShowSurvey());
  }, []);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [isLoadingProjectList, setIsLoadingProjectList] = useState(false);
  const [projectSummaries, setProjectSummaries] = useState<
    StoredProjectSummary[]
  >([]);
  const [projectDeleteConfirmId, setProjectDeleteConfirmId] = useState<
    string | null
  >(null);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.name);
  const [isEditingTimeline, setIsEditingTimeline] = useState(false);
  const [timelineStartDraft, setTimelineStartDraft] = useState(
    project.timelineStart
  );
  const [timelineEndDraft, setTimelineEndDraft] = useState(
    project.timelineEnd
  );
  const [timelineEditError, setTimelineEditError] = useState("");
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(
    new Set()
  );
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    itemId: string;
    descendantCount: number;
  } | null>(null);
  const [isQuickAddingChildren, setIsQuickAddingChildren] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddSessionItems, setQuickAddSessionItems] = useState<
    { id: string; name: string }[]
  >([]);
  const quickAddSnapshotRef = useRef<Project | null>(null);
  const quickAddInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set()
  );
  const selectedItemId =
    selectedItemIds.size === 1 ? [...selectedItemIds][0] : null;

  // Analytics: fires item_change for the just-closed Detail Panel session,
  // only if a field was actually edited during it (see updateWorkItem /
  // toggleUndecided / the color-picker "change" listener below, which are
  // the only places that flip hasChange to true).
  const flushPendingItemChange = () => {
    if (pendingItemChangeRef.current?.hasChange) {
      trackEvent({ eventType: "item_change", projectId: project.id });
    }

    pendingItemChangeRef.current = null;
  };

  // Selection changes away from the quick-add session's parent (clicking
  // another Tree row, deselecting, multi-selecting, etc.) close out the
  // session the same way clicking "완료" would, so it never gets silently
  // orphaned mid-session.
  const selectOnly = (itemId: string) => {
    if (isQuickAddingChildren) finishQuickAddChildren();

    // Re-selecting the item that's already the pending Detail Panel session
    // keeps that session open instead of flushing+restarting it.
    if (pendingItemChangeRef.current?.itemId !== itemId) {
      flushPendingItemChange();
      pendingItemChangeRef.current = { itemId, hasChange: false };
    }

    setSelectedItemIds(new Set([itemId]));
  };

  const toggleMultiSelect = (itemId: string) => {
    if (isQuickAddingChildren) finishQuickAddChildren();

    flushPendingItemChange();

    setSelectedItemIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(itemId)) {
        nextIds.delete(itemId);
      } else {
        nextIds.add(itemId);
      }

      return nextIds;
    });
  };

  const clearSelection = () => {
    if (isQuickAddingChildren) finishQuickAddChildren();

    flushPendingItemChange();

    setSelectedItemIds(new Set());
  };

  const barPressRef = useRef<{
    itemId: string;
    startX: number;
    startY: number;
    interactive: boolean;
    dragging: boolean;
  } | null>(null);
  const suppressBackgroundClickRef = useRef(false);

  const treePressRef = useRef<{
    itemId: string;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
    dragging: boolean;
  } | null>(null);
  const treeListRef = useRef<HTMLDivElement | null>(null);

  const [dragState, setDragState] = useState<BarDragState | null>(null);

  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);

  const [treeDragItemId, setTreeDragItemId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null
  );

  // Analytics: fires project_open once per distinct project id becoming the
  // active project (dedup via lastOpenedProjectIdRef). Safe to call from
  // anywhere a project switch happens.
  const trackProjectOpen = (projectId: string) => {
    if (lastOpenedProjectIdRef.current === projectId) return;

    lastOpenedProjectIdRef.current = projectId;
    trackEvent({ eventType: "project_open", projectId });
  };

  useEffect(() => {
    let cancelled = false;

    loadCurrentProject()
      .then((loaded) => {
        if (cancelled) return;

        if (loaded) {
          resetProjectHistory(loaded);
          trackProjectOpen(loaded.id);
          return;
        }

        // Fresh install / nothing saved yet — persist the default project
        // that useHistoryState already initialized so it becomes the
        // current project going forward.
        saveProject(project).catch(() => {});
        setCurrentProjectId(project.id).catch(() => {});
        trackEvent({ eventType: "project_create", projectId: project.id });
        trackProjectOpen(project.id);
      })
      .catch(() => {
        // IndexedDB unavailable (e.g. private browsing) — keep the default project.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSaveStatus("saving");
      saveProject(project)
        .then(() => setSaveStatus("idle"))
        .catch(() => setSaveStatus("idle"));
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [project]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifierPressed = event.metaKey || event.ctrlKey;

      if (!isModifierPressed || event.key.toLowerCase() !== "z") return;
      // While a quick-add session is open, let Cmd/Ctrl+Z behave as normal
      // native text-input undo instead of discarding the session's
      // not-yet-committed items.
      if (isQuickAddingChildren) return;

      event.preventDefault();

      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, isQuickAddingChildren]);

  useEffect(() => {
    const input = customColorInputRef.current;

    if (!input || !selectedItemId) return;

    // Native "change" — fires exactly once, when the user finalizes a
    // color in the picker. This (not React's onChange, which maps to the
    // continuously-firing native "input" event) is where the final color
    // gets saved to customColors and committed as a single undo step.
    const handleChange = (event: Event) => {
      const hex = (event.target as HTMLInputElement).value;
      const snapshot = colorPickerSnapshotRef.current;

      setProjectTransient((currentProject) => ({
        ...currentProject,
        workItems: currentProject.workItems.map((item) =>
          item.id === selectedItemId ? { ...item, color: hex } : item
        ),
        customColors: currentProject.customColors.includes(hex)
          ? currentProject.customColors
          : [...currentProject.customColors, hex],
      }));

      if (snapshot) {
        commitHistory(snapshot);
        colorPickerSnapshotRef.current = null;
      }

      if (pendingItemChangeRef.current) {
        pendingItemChangeRef.current.hasChange = true;
      }
    };

    input.addEventListener("change", handleChange);

    return () => input.removeEventListener("change", handleChange);
  }, [selectedItemId, setProjectTransient, commitHistory]);

  const GUIDE_CLOSE_ANIMATION_MS = 180;

  const openGuide = () => {
    if (guideCloseTimeoutRef.current) {
      clearTimeout(guideCloseTimeoutRef.current);
      guideCloseTimeoutRef.current = null;
    }

    if (!isGuideOpen) {
      trackEvent({ eventType: "help_open", projectId: project.id });
    }

    setIsGuideClosing(false);
    setIsGuideOpen(true);
  };

  const closeGuide = useCallback(() => {
    setIsGuideClosing(true);
    guideCloseTimeoutRef.current = setTimeout(() => {
      setIsGuideOpen(false);
      setIsGuideClosing(false);
      guideCloseTimeoutRef.current = null;
    }, GUIDE_CLOSE_ANIMATION_MS);
  }, []);

  const scrollToGuideSection = (index: number) => {
    guideSectionRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const jumpToWorkItem = (itemId: string) => {
    selectOnly(itemId);
    treeListRef.current
      ?.querySelector(`[data-row-id="${itemId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    if (!isGuideOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGuide();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGuideOpen, closeGuide]);

  const workItems = project.workItems;
  const inactiveSubtreeIds = getInactiveSubtreeIds(workItems);
  const timelineDates = getDatesInRange(
    project.timelineStart,
    project.timelineEnd
  );
  const effectiveTimelines = getEffectiveWorkItemTimelines(workItems);
  const displayTimelines = getDisplayTimelines(workItems, effectiveTimelines, {
    startDate: project.timelineStart,
    endDate: project.timelineEnd,
  });
  const displayRows = getWorkItemDisplayRows(
    workItems,
    collapsedItemIds,
    displayTimelines
  );

  const selectedItem = workItems.find(
    (item) => item.id === selectedItemId
  );
  const selectedEffectiveTimeline = selectedItem
    ? effectiveTimelines.get(selectedItem.id)
    : null;
  const selectedItemHasChildren = workItems.some(
    (item) => item.parentId === selectedItemId
  );
  const deleteConfirmationItem = deleteConfirmation
    ? workItems.find((item) => item.id === deleteConfirmation.itemId)
    : null;

  const updateWorkItems = (
    updater: (currentItems: WorkItem[]) => WorkItem[]
  ) => {
    setProject((currentProject) =>
      ({
        ...currentProject,
        workItems: sanitizeAutoTimelineFlags(updater(currentProject.workItems)),
      })
    );
  };

  const updateWorkItemsTransient = (
    updater: (currentItems: WorkItem[]) => WorkItem[]
  ) => {
    setProjectTransient((currentProject) =>
      ({
        ...currentProject,
        workItems: updater(currentProject.workItems),
      })
    );
  };

  const startProjectNameEdit = () => {
    setProjectNameDraft(project.name);
    setIsEditingProjectName(true);
  };

  const saveProjectName = () => {
    const name = projectNameDraft.trim();

    if (!name) return;

    setProject((currentProject) => ({
      ...currentProject,
      name,
    }));
    setIsEditingProjectName(false);
  };

  const cancelProjectNameEdit = () => {
    setProjectNameDraft(project.name);
    setIsEditingProjectName(false);
  };

  const startTimelineEdit = () => {
    setTimelineStartDraft(project.timelineStart);
    setTimelineEndDraft(project.timelineEnd);
    setTimelineEditError("");
    setIsEditingTimeline(true);
  };

  const saveTimeline = () => {
    if (!timelineStartDraft || !timelineEndDraft) {
      setTimelineEditError("Timeline 시작일과 종료일을 모두 입력해주세요.");
      return;
    }

    const rangeCheck = validateTimelineRange(
      timelineStartDraft,
      timelineEndDraft
    );

    if (!rangeCheck.valid) {
      setTimelineEditError(rangeCheck.reason);
      return;
    }

    setProject((currentProject) => ({
      ...currentProject,
      timelineStart: timelineStartDraft,
      timelineEnd: timelineEndDraft,
    }));
    setTimelineEditError("");
    setIsEditingTimeline(false);
  };

  const cancelTimelineEdit = () => {
    setTimelineStartDraft(project.timelineStart);
    setTimelineEndDraft(project.timelineEnd);
    setTimelineEditError("");
    setIsEditingTimeline(false);
  };

  const addWorkItem = () => {
    const parentId = selectedItemId ?? null;
    const newWorkItem = createWorkItem({
      id: crypto.randomUUID(),
      name: parentId ? "새 하위 항목" : "새 항목",
      parentId,
      order: getNextSiblingOrder(workItems, parentId),
      // Default to a 1-day bar at the timeline's start so it's always
      // visible and immediately draggable, instead of leaving the item
      // dateless (which would render no bar at all).
      startDate: project.timelineStart,
      endDate: project.timelineStart,
    });

    updateWorkItems((currentItems) => [
      ...currentItems,
      newWorkItem,
    ]);

    if (parentId) {
      setCollapsedItemIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(parentId);
        return nextIds;
      });
    }

    selectOnly(newWorkItem.id);
    trackEvent({ eventType: "item_add", projectId: project.id });
  };

  // Quick-add: lets the user create several sub-items by name only (no
  // date/color setup), one Enter/click per item, without leaving the
  // parent's Detail Panel. Every item created in the session is a
  // transient update (no individual undo step); "완료" folds the whole
  // session into a single undo step via commitHistory, mirroring the
  // drag-and-drop pattern above (dragSnapshotRef + commitHistory).
  const startQuickAddChildren = () => {
    if (!selectedItemId) return;

    quickAddSnapshotRef.current = project;
    setQuickAddSessionItems([]);
    setQuickAddName("");
    setIsQuickAddingChildren(true);
  };

  const finishQuickAddChildren = () => {
    if (quickAddSnapshotRef.current) {
      commitHistory(quickAddSnapshotRef.current);
      quickAddSnapshotRef.current = null;
    }

    setIsQuickAddingChildren(false);
    setQuickAddSessionItems([]);
    setQuickAddName("");
  };

  const addQuickChild = () => {
    const name = quickAddName.trim();

    if (!name || !selectedItemId) return;

    const parentId = selectedItemId;
    const newWorkItem = createWorkItem({
      id: crypto.randomUUID(),
      name,
      parentId,
      order: getNextSiblingOrder(workItems, parentId),
      startDate: project.timelineStart,
      endDate: project.timelineStart,
    });

    updateWorkItemsTransient((currentItems) => [
      ...currentItems,
      newWorkItem,
    ]);

    setCollapsedItemIds((currentIds) => {
      if (!currentIds.has(parentId)) return currentIds;

      const nextIds = new Set(currentIds);
      nextIds.delete(parentId);
      return nextIds;
    });

    setQuickAddSessionItems((current) => [
      ...current,
      { id: newWorkItem.id, name },
    ]);
    setQuickAddName("");
    quickAddInputRef.current?.focus();
    trackEvent({ eventType: "item_add", projectId: project.id });
  };

  const removeQuickAddItem = (itemId: string) => {
    updateWorkItemsTransient((currentItems) =>
      currentItems.filter((item) => item.id !== itemId)
    );
    setQuickAddSessionItems((current) =>
      current.filter((item) => item.id !== itemId)
    );
  };

  const updateWorkItem = (
    field: keyof WorkItem,
    value: string | null | boolean
  ) => {
    if (!selectedItemId) return;

    updateWorkItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== selectedItemId) return item;

        const updated = { ...item, [field]: value };

        // A direct startDate/endDate edit only shrinks/grows the range — it
        // never shifts it — so checkpoints stay put and only get dropped if
        // they now fall outside the new range (see plan issue #6, case 2/3).
        if (field === "startDate" || field === "endDate") {
          updated.checkpoints = clampCheckpointsToRange(
            updated.checkpoints,
            updated.startDate,
            updated.endDate
          );
        }

        return updated;
      })
    );

    if (pendingItemChangeRef.current) {
      pendingItemChangeRef.current.hasChange = true;
    }
  };

  const toggleUndecided = (isUndecided: boolean) => {
    if (!selectedItemId) return;

    updateWorkItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== selectedItemId) return item;

        if (isUndecided) {
          const memo = item.memo
            ? `${item.memo} / ${AUTO_UNDECIDED_MEMO}`
            : AUTO_UNDECIDED_MEMO;

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
      })
    );

    if (pendingItemChangeRef.current) {
      pendingItemChangeRef.current.hasChange = true;
    }
  };

  const addCheckpoint = () => {
    if (!selectedItemId || !selectedItem?.startDate || !selectedItem?.endDate) {
      return;
    }

    const newCheckpoint: Checkpoint = {
      id: crypto.randomUUID(),
      date: selectedItem.startDate,
      label: "",
    };

    updateWorkItems((currentItems) =>
      currentItems.map((item) =>
        item.id === selectedItemId
          ? { ...item, checkpoints: [...item.checkpoints, newCheckpoint] }
          : item
      )
    );

    if (pendingItemChangeRef.current) {
      pendingItemChangeRef.current.hasChange = true;
    }

    trackEvent({ eventType: "checkpoint_add", projectId: project.id });
  };

  const updateCheckpoint = (
    checkpointId: string,
    field: "date" | "label",
    value: string
  ) => {
    if (!selectedItemId) return;

    updateWorkItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== selectedItemId) return item;

        return {
          ...item,
          checkpoints: item.checkpoints.map((checkpoint) => {
            if (checkpoint.id !== checkpointId) return checkpoint;

            if (field === "date" && item.startDate && item.endDate) {
              // Always clamp into the parent's own range — the date input's
              // min/max attributes are advisory only and don't stop a typed
              // out-of-range value, so this keeps the panel and the
              // Timeline bar's own render-time filter from ever disagreeing.
              const clampedDate =
                value < item.startDate
                  ? item.startDate
                  : value > item.endDate
                    ? item.endDate
                    : value;

              return { ...checkpoint, date: clampedDate };
            }

            return { ...checkpoint, [field]: value };
          }),
        };
      })
    );

    if (pendingItemChangeRef.current) {
      pendingItemChangeRef.current.hasChange = true;
    }
  };

  const deleteCheckpoint = (checkpointId: string) => {
    if (!selectedItemId) return;

    updateWorkItems((currentItems) =>
      currentItems.map((item) =>
        item.id === selectedItemId
          ? {
              ...item,
              checkpoints: item.checkpoints.filter(
                (checkpoint) => checkpoint.id !== checkpointId
              ),
            }
          : item
      )
    );

    if (pendingItemChangeRef.current) {
      pendingItemChangeRef.current.hasChange = true;
    }

    trackEvent({ eventType: "checkpoint_delete", projectId: project.id });
  };

  const requestDeleteWorkItem = () => {
    if (!selectedItemId) return;

    const descendantIds = getDescendantWorkItemIds(
      workItems,
      selectedItemId
    );

    setDeleteConfirmation({
      itemId: selectedItemId,
      descendantCount: descendantIds.size,
    });
  };

  const confirmDeleteWorkItem = () => {
    if (!deleteConfirmation) return;

    const deletedItemIds = getDescendantWorkItemIds(
      workItems,
      deleteConfirmation.itemId
    );
    deletedItemIds.add(deleteConfirmation.itemId);

    updateWorkItems((currentItems) =>
      currentItems.filter(
        (item) => !deletedItemIds.has(item.id)
      )
    );

    setCollapsedItemIds((currentIds) =>
      new Set(
        [...currentIds].filter((itemId) => !deletedItemIds.has(itemId))
      )
    );
    clearSelection();
    setDeleteConfirmation(null);
    trackEvent({ eventType: "item_delete", projectId: project.id });
  };

  const toggleCollapsedItem = (itemId: string) => {
    setCollapsedItemIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(itemId)) {
        nextIds.delete(itemId);
      } else {
        nextIds.add(itemId);
      }

      return nextIds;
    });
  };

  const commitTreeDrop = (
    draggedItemId: string,
    indicator: DropIndicator
  ) => {
    let newParentId: string | null;
    let insertAfterId: string | null;

    if (indicator.mode === "root") {
      newParentId = null;
      insertAfterId = null;
    } else if (indicator.mode === "child") {
      newParentId = indicator.targetItemId;
      insertAfterId = null;
    } else {
      const targetItem = workItems.find(
        (item) => item.id === indicator.targetItemId
      );

      if (targetItem) {
        newParentId = targetItem.parentId;

        const siblings = workItems
          .filter(
            (item) =>
              item.parentId === newParentId && item.id !== draggedItemId
          )
          .sort((a, b) => a.order - b.order);
        const targetIndex = siblings.findIndex(
          (item) => item.id === targetItem.id
        );

        insertAfterId =
          indicator.mode === "after"
            ? targetItem.id
            : (siblings[targetIndex - 1]?.id ?? null);
      } else {
        newParentId = null;
        insertAfterId = null;
      }
    }

    const siblingsInOrder = workItems
      .filter(
        (item) => item.parentId === newParentId && item.id !== draggedItemId
      )
      .sort((a, b) => a.order - b.order);
    const newOrder = computeSiblingOrder(siblingsInOrder, insertAfterId);

    const insertIndex = insertAfterId
      ? siblingsInOrder.findIndex((item) => item.id === insertAfterId)
      : -1;
    const before =
      insertIndex >= 0 ? siblingsInOrder[insertIndex].order : null;
    const after =
      insertIndex >= 0
        ? (siblingsInOrder[insertIndex + 1]?.order ?? null)
        : (siblingsInOrder[0]?.order ?? null);

    updateWorkItems((currentItems) => {
      const moved = currentItems.map((item) =>
        item.id === draggedItemId
          ? { ...item, parentId: newParentId, order: newOrder }
          : item
      );

      return needsRebalance(before, newOrder, after)
        ? rebalanceSiblingOrders(moved, newParentId)
        : moved;
    });

    trackEvent({ eventType: "item_move", projectId: project.id });
  };

  const handleTreeRowPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem
  ) => {
    if ((event.target as HTMLElement).closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    const timer = setTimeout(() => {
      const pending = treePressRef.current;

      if (pending && pending.itemId === item.id && !pending.dragging) {
        pending.dragging = true;
        setTreeDragItemId(item.id);
        setDropIndicator(null);
      }
    }, TREE_HOLD_MS);

    treePressRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      timer,
      dragging: false,
    };
  };

  const handleTreeRowPointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const pending = treePressRef.current;

    if (!pending) return;

    if (!pending.dragging) {
      const distance = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY
      );

      if (distance <= TREE_MOVE_PX) return;

      clearTimeout(pending.timer);
      pending.dragging = true;
      setTreeDragItemId(pending.itemId);
      setDropIndicator(null);
    }

    const panelRect = treeListRef.current?.getBoundingClientRect() ?? null;
    const indicator = computeDropIndicator(
      workItems,
      pending.itemId,
      event.clientX,
      event.clientY,
      panelRect
    );

    setDropIndicator(indicator);
  };

  const handleTreeRowPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem
  ) => {
    const pending = treePressRef.current;

    treePressRef.current = null;

    if (!pending) return;

    clearTimeout(pending.timer);

    if (pending.dragging) {
      if (dropIndicator) {
        commitTreeDrop(pending.itemId, dropIndicator);
      }
    } else {
      selectOnly(item.id);
    }

    setTreeDragItemId(null);
    setDropIndicator(null);
  };

  const handleTreeRowPointerCancel = () => {
    const pending = treePressRef.current;

    treePressRef.current = null;

    if (pending) clearTimeout(pending.timer);

    setTreeDragItemId(null);
    setDropIndicator(null);
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const { exportProjectToExcel } = await import(
        "@/lib/export/excel-export"
      );
      await exportProjectToExcel(project);
      trackEvent({ eventType: "project_export", projectId: project.id });
      maybeShowSurvey();
    } catch {
      setExportError("Excel 파일을 내보내는 중 오류가 발생했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const {
        parseExcelToProject,
        computeImportDiff,
        ExcelImportError,
        MAX_IMPORT_FILE_SIZE_BYTES,
      } = await import("@/lib/export/excel-import");

      if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
        throw new ExcelImportError(
          "파일 크기가 너무 큽니다. 50MB 이하의 Excel 파일을 사용해주세요."
        );
      }

      const buffer = await file.arrayBuffer();
      const imported = await parseExcelToProject(buffer, project);

      setPendingImport(imported);
      setPendingImportDiff(computeImportDiff(project, imported));
    } catch (error) {
      setImportError(
        error instanceof Error && error.name === "ExcelImportError"
          ? error.message
          : "Excel 파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다."
      );
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Switches the app to a different project: updates in-memory state,
   * persists it under its own id, and records it as the current project —
   * so "새 프로젝트로 가져오기" leaves the previous project's record
   * untouched in storage (discoverable later via 내 프로젝트), while
   * "덮어쓰기" replaces the current project's record in place.
   */
  const switchToProject = (
    nextProject: Project,
    options?: { isNewProject?: boolean }
  ) => {
    resetProjectHistory(nextProject);
    setCollapsedItemIds(new Set());
    clearSelection();
    saveProject(nextProject).catch(() => {});
    setCurrentProjectId(nextProject.id).catch(() => {});

    if (options?.isNewProject) {
      trackEvent({ eventType: "project_create", projectId: nextProject.id });
    }
    trackProjectOpen(nextProject.id);
  };

  const applyPendingImport = (mode: "new" | "overwrite") => {
    if (!pendingImport) return;

    const nextProject: Project =
      mode === "new"
        ? { ...pendingImport, id: crypto.randomUUID() }
        : { ...pendingImport, id: project.id };

    switchToProject(nextProject, { isNewProject: mode === "new" });
    setPendingImport(null);
    setPendingImportDiff(null);
    setIsOverwritePreviewOpen(false);
    maybeShowSurvey();
  };

  const cancelPendingImport = () => {
    setPendingImport(null);
    setPendingImportDiff(null);
    setIsOverwritePreviewOpen(false);
  };

  // "덮어쓰기" replaces the whole project, so anything in the current
  // project that isn't in the file would otherwise vanish silently. If the
  // diff shows any actual change, require the user to see exactly what's
  // being added/modified/deleted first; a no-op re-import (identical file)
  // skips straight to applying since there's nothing to warn about.
  const handleOverwriteImportClick = () => {
    const diff = pendingImportDiff;
    const hasChanges =
      diff &&
      (diff.workItems.added.length > 0 ||
        diff.workItems.modified.length > 0 ||
        diff.workItems.deleted.length > 0 ||
        diff.checkpoints.added.length > 0 ||
        diff.checkpoints.modified.length > 0 ||
        diff.checkpoints.deleted.length > 0);

    if (hasChanges) {
      setIsOverwritePreviewOpen(true);
    } else {
      applyPendingImport("overwrite");
    }
  };

  const renderDiffEntryList = (
    label: string,
    entries: ImportDiffEntry[],
    tone: "add" | "modify" | "delete"
  ) => {
    if (entries.length === 0) return null;

    const toneClass =
      tone === "add"
        ? "text-blue-600"
        : tone === "modify"
          ? "text-amber-600"
          : "text-red-600";
    const maxVisible = 8;
    const visible = entries.slice(0, maxVisible);
    const remaining = entries.length - visible.length;

    return (
      <div>
        <p className={`text-xs font-semibold ${toneClass}`}>
          {label} {entries.length}개
        </p>
        <ul className="mt-1 space-y-0.5 pl-3 text-xs text-zinc-600">
          {visible.map((entry) => (
            <li key={entry.id} className="truncate">
              · {entry.name || "(이름 없음)"}
            </li>
          ))}
          {remaining > 0 && (
            <li className="text-zinc-400">외 {remaining}개</li>
          )}
        </ul>
      </div>
    );
  };

  const refreshProjectList = () => {
    setIsLoadingProjectList(true);

    listProjectSummaries()
      .then((summaries) => setProjectSummaries(summaries))
      .catch(() => setProjectSummaries([]))
      .finally(() => setIsLoadingProjectList(false));
  };

  const openProjectList = () => {
    setIsProjectListOpen(true);
    refreshProjectList();
  };

  const createNewProject = () => {
    switchToProject(createDefaultProject(), { isNewProject: true });
    setIsProjectListOpen(false);
  };

  const openProjectFromList = async (projectId: string) => {
    if (projectId === project.id) {
      setIsProjectListOpen(false);
      return;
    }

    const target = await loadProjectById(projectId);

    if (!target) return;

    resetProjectHistory(target);
    setCollapsedItemIds(new Set());
    clearSelection();
    setCurrentProjectId(target.id).catch(() => {});
    // Reaching here means projectId !== project.id (checked above) and this
    // is an explicit "내 프로젝트" pick — not the initial load and not a
    // just-created project auto-opening — so it's a genuine user-initiated
    // switch between two existing projects.
    trackEvent({ eventType: "project_switch", projectId: target.id });
    trackProjectOpen(target.id);
    setIsProjectListOpen(false);
  };

  const confirmDeleteProjectFromList = async () => {
    const targetId = projectDeleteConfirmId;

    if (!targetId) return;

    await deleteProject(targetId);
    setProjectDeleteConfirmId(null);

    const remaining = await listProjectSummaries();

    setProjectSummaries(remaining);

    if (targetId === project.id) {
      if (remaining.length > 0) {
        const target = await loadProjectById(remaining[0].id);

        if (target) {
          resetProjectHistory(target);
          setCollapsedItemIds(new Set());
          clearSelection();
          setCurrentProjectId(target.id).catch(() => {});
          trackProjectOpen(target.id);
        }
      } else {
        switchToProject(createDefaultProject(), { isNewProject: true });
      }
    }
  };

  const handleBarPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);

    const interactive =
      !item.autoTimeline &&
      !item.isUndecided &&
      Boolean(item.startDate) &&
      Boolean(item.endDate);

    barPressRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      interactive,
      dragging: false,
    };
  };

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    item: WorkItem,
    action: "resize-start" | "resize-end"
  ) => {
    if (item.autoTimeline || item.isUndecided || !item.startDate || !item.endDate) return;

    event.preventDefault();
    event.stopPropagation();

    event.currentTarget.setPointerCapture(event.pointerId);
    dragSnapshotRef.current = project;

    const groupItems = getDragGroupItems(item.id, selectedItemIds, workItems);

    setDragState({
      action,
      startX: event.clientX,
      primaryItemId: item.id,
      originals: groupItems.map((groupItem) => ({
        itemId: groupItem.id,
        startDate: groupItem.startDate as string,
        endDate: groupItem.endDate as string,
        checkpoints: groupItem.checkpoints,
      })),
    });
  };

  const applyGroupDrag = (state: BarDragState, clientX: number) => {
    const updates = computeGroupDraggedDates(
      state,
      clientX,
      dayWidth,
      project.timelineStart,
      project.timelineEnd
    );

    if (!updates) return;

    updateWorkItemsTransient((currentItems) =>
      currentItems.map((currentItem) => {
        const update = updates.get(currentItem.id);

        if (!update) return currentItem;

        // A pure move shifts start/end by the same amount, so checkpoints
        // (stored as absolute dates) must shift with them or they'd visually
        // detach from the bar. Resize never reaches this branch — resized
        // items keep their checkpoints' absolute dates untouched (see
        // handlePointerUp's post-resize clamp instead).
        if (state.action === "move") {
          const original = state.originals.find(
            (candidate) => candidate.itemId === currentItem.id
          );
          // Always recompute from the frozen original snapshot (never from
          // currentItem, which may still hold a shift from an earlier
          // pointermove) — otherwise dragging past a day boundary and back
          // leaves the checkpoint stuck a day off from the bar.
          const deltaDays = original
            ? getDaysBetween(original.startDate, update.startDate)
            : 0;
          const checkpoints = original
            ? original.checkpoints.map((checkpoint) => ({
                ...checkpoint,
                date: addDays(checkpoint.date, deltaDays),
              }))
            : currentItem.checkpoints;

          return {
            ...currentItem,
            startDate: update.startDate,
            endDate: update.endDate,
            checkpoints,
          };
        }

        return { ...currentItem, startDate: update.startDate, endDate: update.endDate };
      })
    );
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (dragState) {
      applyGroupDrag(dragState, event.clientX);
      return;
    }

    const pending = barPressRef.current;

    if (!pending || !pending.interactive) return;

    const distance = Math.hypot(
      event.clientX - pending.startX,
      event.clientY - pending.startY
    );

    if (distance <= BAR_CLICK_MOVE_PX) return;

    const groupItems = getDragGroupItems(
      pending.itemId,
      selectedItemIds,
      workItems
    );

    if (groupItems.length === 0) return;

    pending.dragging = true;
    dragSnapshotRef.current = project;

    const descriptor: BarDragState = {
      action: "move",
      startX: pending.startX,
      primaryItemId: pending.itemId,
      originals: groupItems.map((groupItem) => ({
        itemId: groupItem.id,
        startDate: groupItem.startDate as string,
        endDate: groupItem.endDate as string,
        checkpoints: groupItem.checkpoints,
      })),
    };

    setDragState(descriptor);
    applyGroupDrag(descriptor, event.clientX);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (dragState) {
      if (dragSnapshotRef.current) {
        // Resize can shrink an item's range past a checkpoint's date; move
        // never can (see applyGroupDrag). Fold this into the same transient
        // session so it lands inside the one commitHistory undo step below.
        if (dragState.action !== "move") {
          updateWorkItemsTransient((currentItems) =>
            currentItems.map((item) => {
              const original = dragState.originals.find(
                (candidate) => candidate.itemId === item.id
              );

              if (!original || item.checkpoints.length === 0) return item;

              const clamped = clampCheckpointsToRange(
                item.checkpoints,
                item.startDate,
                item.endDate
              );

              return clamped.length === item.checkpoints.length
                ? item
                : { ...item, checkpoints: clamped };
            })
          );
        }

        commitHistory(dragSnapshotRef.current);
        dragSnapshotRef.current = null;
      }

      // Analytics: only counts as a real timeline_move/timeline_resize if a
      // date actually ended up different from where the drag started (a
      // plain click on a resize handle, with no movement, sets dragState
      // but never changes anything).
      const hasScheduleChange = dragState.originals.some((original) => {
        const current = workItems.find((item) => item.id === original.itemId);
        return (
          current !== undefined &&
          (current.startDate !== original.startDate ||
            current.endDate !== original.endDate)
        );
      });

      if (hasScheduleChange) {
        trackEvent({
          eventType: dragState.action === "move" ? "timeline_move" : "timeline_resize",
          projectId: project.id,
        });
      }

      setDragState(null);
      barPressRef.current = null;
      suppressBackgroundClickRef.current = true;
      return;
    }

    const pending = barPressRef.current;

    barPressRef.current = null;

    if (!pending) return;

    if (event.metaKey || event.ctrlKey) {
      toggleMultiSelect(pending.itemId);
    } else {
      selectOnly(pending.itemId);
    }
  };

  const handleTimelineBackgroundClick = () => {
    if (suppressBackgroundClickRef.current) {
      suppressBackgroundClickRef.current = false;
      return;
    }

    clearSelection();
  };

  const handlePointerCancel = () => {
    barPressRef.current = null;

    if (dragState) {
      dragSnapshotRef.current = null;
      setDragState(null);
    }
  };

  return (
    <main className="flex h-screen min-h-0 flex-col bg-white text-zinc-900">
      {/* Header */}
      <header className="flex shrink-0 flex-col gap-5 border-b border-zinc-200 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4 md:flex-nowrap">
          <Image
            src="/logo.svg"
            alt="TO-DO-LINE"
            width={111}
            height={32}
            priority
            className="h-8 w-auto shrink-0"
          />

          <div className="flex w-full flex-wrap items-center gap-4 md:w-auto md:flex-nowrap md:shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo || isQuickAddingChildren}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-300"
                aria-label="실행 취소"
              >
                실행취소
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo || isQuickAddingChildren}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-300"
                aria-label="다시 실행"
              >
                다시실행
              </button>
            </div>

            <div className="h-4 w-px bg-zinc-200" />

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDayWidth((width) =>
                    Math.max(MIN_DAY_WIDTH, width - 4)
                  );
                  trackEvent({ eventType: "zoom_out", projectId: project.id });
                }}
                disabled={dayWidth <= MIN_DAY_WIDTH}
                className="flex h-5 w-5 items-center justify-center text-xs text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-300"
                aria-label="축소"
              >
                −
              </button>
              <span className="w-9 text-center text-xs text-zinc-500">
                {Math.round((dayWidth / DEFAULT_DAY_WIDTH) * 100)}%
              </span>
              <button
                type="button"
                onClick={() => {
                  setDayWidth((width) =>
                    Math.min(MAX_DAY_WIDTH, width + 4)
                  );
                  trackEvent({ eventType: "zoom_in", projectId: project.id });
                }}
                disabled={dayWidth >= MAX_DAY_WIDTH}
                className="flex h-5 w-5 items-center justify-center text-xs text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-300"
                aria-label="확대"
              >
                +
              </button>
            </div>

            <div className="h-4 w-px bg-zinc-200" />

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isExporting}
                className="flex h-7 items-center rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isExporting ? "내보내는 중..." : "Excel로 내보내기"}
              </button>

              <button
                type="button"
                onClick={() => importFileInputRef.current?.click()}
                disabled={isImporting}
                className="flex h-7 items-center rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isImporting ? "불러오는 중..." : "Excel 불러오기"}
              </button>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleImportFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={openProjectList}
                className="flex h-7 items-center gap-1 rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                내 프로젝트
              </button>
            </div>

            <div className="h-4 w-px bg-zinc-200" />

            <div className="text-xs font-semibold text-blue-600">
              {saveStatus === "saving" ? "저장 중..." : "저장됨"}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              trackEvent({ eventType: "feedback_open", projectId: project.id });
              setIsFeedbackOpen(true);
            }}
            className="-translate-y-[10px] flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-zinc-600"
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            오류 신고 · 개선 제안
          </button>
        </div>

        <div className="min-w-0 space-y-1.5">
          {isEditingProjectName ? (
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                autoFocus
                value={projectNameDraft}
                onChange={(event) =>
                  setProjectNameDraft(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  if (event.nativeEvent.isComposing || event.keyCode === 229) {
                    return;
                  }

                  event.preventDefault();
                  saveProjectName();
                }}
                className="min-w-0 border-b-2 border-blue-600 bg-transparent text-4xl font-bold tracking-tight text-zinc-900 outline-none md:text-5xl"
              />
              <button
                type="button"
                onClick={saveProjectName}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                저장
              </button>
              <button
                type="button"
                onClick={cancelProjectNameEdit}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-4xl font-bold tracking-tight text-zinc-900 md:text-5xl">
                {project.name}
              </h1>
              <button
                type="button"
                onClick={startProjectNameEdit}
                className="shrink-0 text-base text-blue-600 hover:text-blue-700"
                aria-label="프로젝트명 편집"
              >
                ✎
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            {isEditingTimeline ? (
              <>
                <span>Timeline:</span>
                <input
                  type="date"
                  required
                  value={timelineStartDraft}
                  onChange={(event) =>
                    setTimelineStartDraft(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    saveTimeline();
                  }}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-blue-600"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  required
                  value={timelineEndDraft}
                  min={timelineStartDraft || undefined}
                  max={getMaxTimelineEndDate(timelineStartDraft) ?? undefined}
                  onChange={(event) =>
                    setTimelineEndDraft(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    saveTimeline();
                  }}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={saveTimeline}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={cancelTimelineEdit}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  취소
                </button>
                {timelineEditError && (
                  <span className="text-xs text-red-600">
                    {timelineEditError}
                  </span>
                )}
              </>
            ) : (
              <>
                <span>
                  Timeline:{" "}
                  <span className="font-medium text-zinc-700">
                    {project.timelineStart} ~ {project.timelineEnd}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={startTimelineEdit}
                  className="text-blue-600 hover:text-blue-700"
                  aria-label="Timeline 기간 편집"
                >
                  ✎
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Workspace */}
      <div
        className={`flex min-h-0 min-w-0 flex-1 overflow-x-auto pl-4 [-webkit-overflow-scrolling:touch] ${
          selectedItem ? "" : "pr-4"
        }`}
      >
        {/* Work Item Panel */}
        <section className="flex w-[320px] shrink-0 flex-col border-r border-zinc-200">
          <div className="flex h-12 items-center border-b border-zinc-200 px-4">
            <span className="text-sm font-semibold">
              Work Items
            </span>
          </div>

          <div ref={treeListRef} className="relative flex-1 overflow-auto">
            {treeDragItemId && dropIndicator?.mode === "root" && (
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] bg-blue-400/60" />
            )}

            {displayRows.map(({ item, depth, hasChildren }) => {
              const isSelected = selectedItemIds.has(item.id);
              const isCollapsed = collapsedItemIds.has(item.id);
              const isDropTarget =
                dropIndicator?.mode !== "root" &&
                dropIndicator?.mode !== undefined &&
                dropIndicator?.targetItemId === item.id;

              const dropBorderClass =
                isDropTarget && dropIndicator?.mode === "before"
                  ? "border-t-blue-400/70 border-b-zinc-100"
                  : isDropTarget && dropIndicator?.mode === "after"
                    ? "border-t-transparent border-b-blue-400/70"
                    : "border-t-transparent border-b-zinc-100";
              const backgroundClass =
                (isDropTarget && dropIndicator?.mode === "child") ||
                isSelected
                  ? "bg-blue-50"
                  : "hover:bg-zinc-50";

              return (
                <div
                  key={item.id}
                  data-row-id={item.id}
                  onPointerDown={(event) =>
                    handleTreeRowPointerDown(event, item)
                  }
                  onPointerMove={handleTreeRowPointerMove}
                  onPointerUp={(event) => handleTreeRowPointerUp(event, item)}
                  onPointerCancel={handleTreeRowPointerCancel}
                  className={`flex h-11 w-full touch-none select-none items-center border-t border-b text-left transition-colors ${backgroundClass} ${dropBorderClass} ${
                    inactiveSubtreeIds.has(item.id) ? "opacity-40" : ""
                  }`}
                >
                  <div
                    className="flex w-full items-center gap-2"
                    style={{
                      paddingLeft: `${16 + depth * 20}px`,
                    }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapsedItem(item.id)}
                        className="flex h-5 w-5 items-center justify-center text-xs text-zinc-500"
                        aria-label={`${item.name} ${
                          isCollapsed ? "펼치기" : "접기"
                        }`}
                      >
                        {isCollapsed ? "▶" : "▼"}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}

                    <span className="min-w-0 flex-1 truncate py-2 pr-3 text-left text-sm">
                      {item.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addWorkItem}
            className="border-t border-zinc-200 px-4 py-3 text-left text-sm text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            + 항목 추가
          </button>
        </section>

        {/* Timeline */}
        <section className="flex min-w-[240px] flex-1 flex-col">
          <div className="flex-1 overflow-auto">
            <div
              className="min-w-max"
              style={{ width: `${timelineDates.length * dayWidth}px` }}
              onClick={handleTimelineBackgroundClick}
            >
              <div className="flex h-12 border-b border-zinc-200">
                {timelineDates.map((date) => {
                  const saturday = isSaturday(date);
                  const sunday = isSunday(date);

                  return (
                    <div
                      key={date}
                      className={`flex shrink-0 flex-col items-center justify-center border-r border-zinc-100 px-2 text-xs ${
                        saturday || sunday ? "bg-zinc-50" : ""
                      }`}
                      style={{ width: `${dayWidth}px` }}
                    >
                      <span
                        className={
                          saturday
                            ? "text-blue-600"
                            : sunday
                              ? "text-red-600"
                              : "text-zinc-500"
                        }
                      >
                        {`${Number(date.slice(5, 7))}/${Number(
                          date.slice(8, 10)
                        )}`}
                      </span>
                      <span
                        className={
                          saturday
                            ? "text-[10px] text-blue-600"
                            : sunday
                              ? "text-[10px] text-red-600"
                              : "text-[10px] text-zinc-400"
                        }
                      >
                        {getWeekdayLabel(date)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {displayRows.map(({ item, timelineBar }) => {
                const effectiveTimeline = timelineBar?.timeline ?? null;
                const isInteractive =
                  !item.autoTimeline && !item.isUndecided;

                return (
                  <div
                    key={item.id}
                    className={`relative h-11 border-b border-zinc-100 ${
                      inactiveSubtreeIds.has(item.id) ? "opacity-40" : ""
                    }`}
                  >
                  <div className="absolute inset-0 flex">
                    {timelineDates.map((date) => (
                      <div
                        key={date}
                        className={`shrink-0 border-r border-zinc-100 ${
                          isSaturday(date) || isSunday(date)
                            ? "bg-zinc-50"
                            : ""
                        }`}
                        style={{ width: `${dayWidth}px` }}
                      />
                    ))}
                  </div>

                  {effectiveTimeline && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) =>
                        handleBarPointerDown(event, item)
                      }
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      className={`absolute top-2 flex h-7 items-center rounded-md px-2 text-xs select-none touch-none ${
                        selectedItemIds.has(item.id)
                          ? "ring-2 ring-offset-1 ring-blue-500"
                          : ""
                      } ${
                        item.isUndecided
                          ? "cursor-default border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400"
                          : item.autoTimeline
                            ? "cursor-default text-white"
                            : dragState?.originals.some(
                                  (original) => original.itemId === item.id
                                )
                              ? "cursor-grabbing text-white"
                              : "cursor-grab text-white"
                      }`}
                      style={{
                        left: `${
                          getTimelineOffset(
                            project.timelineStart,
                            effectiveTimeline.startDate
                          ) * dayWidth
                        }px`,
                        width: `${
                          getTimelineDuration(
                            effectiveTimeline.startDate,
                            effectiveTimeline.endDate
                          ) * dayWidth
                        }px`,
                        ...getBarBackground(item, effectiveTimeline, workItems),
                      }}
                    >
                      {item.isUndecided ? "일정 미정" : null}
                      {isInteractive &&
                        item.checkpoints
                          .filter(
                            (checkpoint) =>
                              checkpoint.date >= effectiveTimeline.startDate &&
                              checkpoint.date <= effectiveTimeline.endDate
                          )
                          .map((checkpoint) => {
                            const baseColor = item.color ?? DEFAULT_BAR_COLOR;
                            const showLabel = dayWidth >= 28;

                            return (
                              <div
                                key={checkpoint.id}
                                title={checkpoint.label}
                                className="pointer-events-none absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-[3px] border-[3px] text-[9px] font-semibold leading-none text-white"
                                style={{
                                  left: `${
                                    getTimelineOffset(
                                      effectiveTimeline.startDate,
                                      checkpoint.date
                                    ) * dayWidth
                                  }px`,
                                  width: `${dayWidth}px`,
                                  backgroundColor: darkenColor(baseColor, 0.22),
                                  borderColor: darkenColor(baseColor, 0.4),
                                }}
                              >
                                {showLabel && (
                                  <span className="truncate px-0.5">
                                    {checkpoint.label}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      {isInteractive && (
                        <>
                          <div
                            onPointerDown={(event) =>
                              handleResizePointerDown(
                                event,
                                item,
                                "resize-start"
                              )
                            }
                            className="absolute inset-y-0 left-0 cursor-ew-resize"
                            style={{
                              width: `${getResizeHandleWidth(
                                effectiveTimeline.startDate,
                                effectiveTimeline.endDate,
                                dayWidth
                              )}px`,
                            }}
                          />
                          <div
                            onPointerDown={(event) =>
                              handleResizePointerDown(
                                event,
                                item,
                                "resize-end"
                              )
                            }
                            className="absolute inset-y-0 right-0 cursor-ew-resize"
                            style={{
                              width: `${getResizeHandleWidth(
                                effectiveTimeline.startDate,
                                effectiveTimeline.endDate,
                                dayWidth
                              )}px`,
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Detail Panel */}
        {selectedItem && (
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-zinc-200 bg-white">
            <div className="flex h-12 items-center justify-between border-b border-zinc-200 px-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  Work Item
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateWorkItem("active", !selectedItem.active)
                  }
                  aria-label={
                    selectedItem.active
                      ? "항목 비활성화"
                      : "항목 활성화"
                  }
                  aria-pressed={selectedItem.active}
                  className={`flex h-5 w-5 items-center justify-center ${
                    selectedItem.active ? "text-blue-600" : "text-zinc-400"
                  }`}
                >
                  {selectedItem.active ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={clearSelection}
                className="text-sm text-zinc-400 hover:text-zinc-900"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto p-4">
              {/* Name */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  항목명
                </span>

                <input
                  type="text"
                  value={selectedItem.name}
                  onChange={(event) =>
                    updateWorkItem(
                      "name",
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </label>

              {/* Color */}
              <div className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  색상
                </span>

                <div className="flex flex-wrap gap-2">
                  {[...DEFAULT_COLOR_PALETTE, ...project.customColors].map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateWorkItem("color", color)}
                        aria-label={`색상 ${color} 선택`}
                        className={`h-6 w-6 rounded-full border-2 ${
                          selectedItem.color === color
                            ? "border-zinc-900"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    )
                  )}

                  <div className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-xs text-zinc-400">
                    +
                    <input
                      ref={customColorInputRef}
                      type="color"
                      value={selectedItem.color ?? DEFAULT_BAR_COLOR}
                      onPointerDown={() => {
                        colorPickerSnapshotRef.current = project;
                      }}
                      onChange={(event) => {
                        // Native "input" event (React's onChange) — fires
                        // continuously while the user drags across the
                        // picker. Preview only; never persist to
                        // customColors here, or every intermediate color
                        // the pointer passes over would get saved.
                        const hex = event.target.value;
                        const itemId = selectedItemId;

                        if (!itemId) return;

                        updateWorkItemsTransient((currentItems) =>
                          currentItems.map((item) =>
                            item.id === itemId ? { ...item, color: hex } : item
                          )
                        );
                      }}
                      aria-label="사용자 지정 색상 추가"
                      className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                    />
                  </div>
                </div>
              </div>


              {selectedItemHasChildren && (
                <label className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                  <span className="text-sm">하위 일정 자동 반영</span>
                  <input
                    type="checkbox"
                    checked={selectedItem.autoTimeline}
                    onChange={(event) =>
                      updateWorkItem("autoTimeline", event.target.checked)
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                </label>
              )}

              <label
                className={`flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 ${
                  selectedItem.autoTimeline ? "opacity-40" : ""
                }`}
              >
                <span className="text-sm">일정 미정</span>
                <input
                  type="checkbox"
                  checked={selectedItem.isUndecided}
                  disabled={selectedItem.autoTimeline}
                  onChange={(event) =>
                    toggleUndecided(event.target.checked)
                  }
                  className="h-4 w-4 accent-blue-600"
                />
              </label>

              {selectedItem.autoTimeline && (
                <div className="rounded-md bg-zinc-100 p-3 text-xs text-zinc-600">
                  {selectedEffectiveTimeline ? (
                    <>
                      하위 일정으로 자동 계산됨: {" "}
                      {selectedEffectiveTimeline.startDate} ~ {" "}
                      {selectedEffectiveTimeline.endDate}
                    </>
                  ) : (
                    "하위 일정이 없어 기간을 계산할 수 없습니다."
                  )}
                </div>
              )}

              {/* Start Date */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  시작일
                </span>

                <input
                  type="date"
                  value={selectedItem.startDate ?? ""}
                  onChange={(event) =>
                    updateWorkItem(
                      "startDate",
                      event.target.value || null
                    )
                  }
                  disabled={selectedItem.autoTimeline || selectedItem.isUndecided}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-100"
                />
              </label>

              {/* End Date */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  종료일
                </span>

                <input
                  type="date"
                  value={selectedItem.endDate ?? ""}
                  onChange={(event) =>
                    updateWorkItem(
                      "endDate",
                      event.target.value || null
                    )
                  }
                  disabled={selectedItem.autoTimeline || selectedItem.isUndecided}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-100"
                />
              </label>

              {/* Checkpoints */}
              <div className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  체크포인트
                </span>

                {selectedItem.autoTimeline ||
                selectedItem.isUndecided ||
                !selectedItem.startDate ||
                !selectedItem.endDate ? (
                  <p className="rounded-md bg-zinc-100 p-3 text-xs text-zinc-500">
                    시작일/종료일이 지정된 일정에서만 체크포인트를 추가할 수
                    있습니다.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...selectedItem.checkpoints]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((checkpoint) => (
                        <div
                          key={checkpoint.id}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="date"
                            value={checkpoint.date}
                            min={selectedItem.startDate ?? undefined}
                            max={selectedItem.endDate ?? undefined}
                            disabled={isQuickAddingChildren}
                            onChange={(event) =>
                              updateCheckpoint(
                                checkpoint.id,
                                "date",
                                event.target.value
                              )
                            }
                            className="w-[136px] rounded-md border border-zinc-300 px-2 py-1.5 text-xs outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                          <input
                            type="text"
                            value={checkpoint.label}
                            maxLength={20}
                            placeholder="라벨"
                            disabled={isQuickAddingChildren}
                            onChange={(event) =>
                              updateCheckpoint(
                                checkpoint.id,
                                "label",
                                event.target.value
                              )
                            }
                            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                          <button
                            type="button"
                            disabled={isQuickAddingChildren}
                            onClick={() => deleteCheckpoint(checkpoint.id)}
                            aria-label="체크포인트 삭제"
                            className="shrink-0 text-xs text-zinc-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            삭제
                          </button>
                        </div>
                      ))}

                    <button
                      type="button"
                      disabled={isQuickAddingChildren}
                      onClick={addCheckpoint}
                      className="w-full rounded-md border border-dashed border-zinc-300 py-1.5 text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      + 체크포인트 추가
                    </button>
                  </div>
                )}
              </div>

              {/* Memo */}
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  메모
                </span>

                <textarea
                  value={selectedItem.memo}
                  onChange={(event) =>
                    updateWorkItem("memo", event.target.value)
                  }
                  rows={3}
                  placeholder="메모 입력"
                  className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </label>
            </div>

            <div className="border-t border-zinc-200 p-4">
              {isQuickAddingChildren ? (
                <div className="space-y-2">
                  <span className="block text-xs font-medium text-zinc-500">
                    하위 항목 이름을 입력하고 Enter 또는 추가를 누르세요
                  </span>

                  {quickAddSessionItems.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {quickAddSessionItems.map((item) => (
                        <span
                          key={item.id}
                          className="flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-50 py-1 pl-2.5 pr-1.5 text-xs text-zinc-700"
                        >
                          {item.name}
                          <button
                            type="button"
                            onClick={() => removeQuickAddItem(item.id)}
                            aria-label={`${item.name} 취소`}
                            className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      ref={quickAddInputRef}
                      type="text"
                      autoFocus
                      value={quickAddName}
                      onChange={(event) =>
                        setQuickAddName(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          // Ignore the Enter that finalizes an in-progress
                          // IME composition (Korean/Japanese/Chinese) —
                          // otherwise the not-yet-committed text gets
                          // submitted early and the trailing composed
                          // characters get added again as a second item.
                          if (
                            event.nativeEvent.isComposing ||
                            event.keyCode === 229
                          ) {
                            return;
                          }

                          event.preventDefault();
                          addQuickChild();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          finishQuickAddChildren();
                        }
                      }}
                      placeholder="하위 항목 이름"
                      className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={addQuickChild}
                      className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
                    >
                      추가
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={finishQuickAddChildren}
                    className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    완료
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={startQuickAddChildren}
                    className="mb-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
                  >
                    + 하위 항목 추가
                  </button>
                  <button
                    type="button"
                    onClick={requestDeleteWorkItem}
                    className="w-full rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
                  >
                    항목 삭제
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      <AiPanel
        project={project}
        updateWorkItems={updateWorkItems}
        onJumpToWorkItem={jumpToWorkItem}
        isDetailPanelOpen={Boolean(selectedItem)}
        onSignificantSuccess={maybeShowSurvey}
      />

      <SatisfactionSurveyModal
        isOpen={isSurveyOpen}
        onClose={() => setIsSurveyOpen(false)}
        projectId={project.id}
      />

      <FeedbackReportModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        projectId={project.id}
      />

      <button
        type="button"
        onClick={openGuide}
        aria-label="사용법 보기"
        className={`fixed bottom-6 right-6 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-base font-semibold text-white shadow-lg transition-[right,transform] duration-200 ease-out hover:bg-blue-700 active:scale-90 ${
          selectedItem ? "md:right-[344px]" : ""
        }`}
      >
        ?
      </button>

      {isGuideOpen && (
        <div
          onClick={closeGuide}
          className={`fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 ${
            isGuideClosing
              ? "animate-[guide-backdrop-out_180ms_ease-in_forwards]"
              : "animate-[guide-backdrop-in_180ms_ease-out]"
          }`}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className={`flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl ${
              isGuideClosing
                ? "animate-[guide-panel-out_180ms_ease-in_forwards]"
                : "animate-[guide-panel-in_220ms_ease-out]"
            }`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  TO-DO-LINE 사용 설명서
                </h2>
                <p className="text-xs text-zinc-500">
                  업무를 잇고, 흐름을 보다.
                </p>
              </div>
              <button
                type="button"
                onClick={closeGuide}
                aria-label="사용법 닫기"
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-200 bg-zinc-50/70 px-5 py-2.5">
              <p className="text-[11px] text-zinc-400">
                상단 메뉴에서 원하는 내용을 선택하면 해당 위치로 이동할 수
                있습니다.
              </p>
              <div className="flex gap-1.5 overflow-x-auto">
                {GUIDE_TABS.map((tab, index) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => scrollToGuideSection(index)}
                    className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-95"
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4">
                <Image
                  src="/icons/guide/screen.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0"
                />
                <p className="text-sm leading-relaxed text-zinc-700">
                  TO-DO-LINE은 프로젝트의 업무 구조와 일정을 Timeline으로
                  구성하여{" "}
                  <b className="text-zinc-900">
                    업무의 위계와 시간의 흐름을 한눈에 확인할 수 있도록 돕는
                    업무 관리 도구
                  </b>
                  입니다.
                </p>
              </div>

              <div
                ref={(el) => {
                  guideSectionRefs.current[0] = el;
                }}
              >
                <h2 className="mb-1 text-lg font-bold text-zinc-900">
                  전체 설명
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  프로젝트를 시작하는 단계부터 Excel 내보내기까지, 전체
                  사용 흐름을 순서대로 확인할 수 있습니다.
                </p>
                <div className="space-y-4">
                  {GUIDE_FULL_STEPS.map((step) => (
                    <div
                      key={step.number}
                      className="rounded-xl border border-zinc-200 p-5"
                    >
                      <div className="mb-2.5 flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                          {step.number}
                        </span>
                        <h3 className="text-base font-semibold text-zinc-900">
                          {step.title}
                        </h3>
                      </div>
                      <div className="space-y-2.5 pl-11 text-sm leading-relaxed text-zinc-700">
                        {step.body}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                ref={(el) => {
                  guideSectionRefs.current[1] = el;
                }}
                className="mt-10"
              >
                <h2 className="mb-1 text-lg font-bold text-zinc-900">
                  요약 설명
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  핵심적인 조작 방법만 짧게 확인하고 싶다면 아래 요약을
                  참고하세요.
                </p>
                <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                  {GUIDE_SUMMARY_STEPS.map((step) => (
                    <div
                      key={step.number}
                      className="flex items-start gap-3 px-4 py-3"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
                        {step.number}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-zinc-900">
                          {step.title}
                        </h4>
                        <div className="text-xs leading-relaxed text-zinc-600">
                          {step.body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                ref={(el) => {
                  guideSectionRefs.current[2] = el;
                }}
                className="mt-10"
              >
                <h2 className="mb-1 text-lg font-bold text-zinc-900">
                  자주 묻는 질문
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  질문을 클릭하면 답변이 펼쳐집니다.
                </p>
                <GuideFaqSection items={GUIDE_FAQ_ITEMS} />
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmation && deleteConfirmationItem && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Work Item 삭제</h2>
            <p className="mt-2 text-sm text-zinc-600">
              {deleteConfirmationItem.name}와 하위 업무 {" "}
              {deleteConfirmation.descendantCount}개를 삭제하시겠습니까?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDeleteWorkItem}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {isProjectListOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <h2 className="text-base font-semibold">내 프로젝트</h2>
              <button
                type="button"
                onClick={() => setIsProjectListOpen(false)}
                className="text-sm text-zinc-400 hover:text-zinc-900"
              >
                ✕
              </button>
            </div>

            <div className="border-b border-zinc-200 bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-800">
              ⚠️ 이 프로젝트들은 현재 사용 중인 기기의 이 브라우저에만 저장됩니다.
              브라우저 데이터(캐시/사이트 데이터)를 삭제하면 프로젝트를 복구할 수
              없습니다.
            </div>

            <div className="flex-1 overflow-auto p-3">
              {isLoadingProjectList ? (
                <div className="p-4 text-center text-sm text-zinc-400">
                  불러오는 중...
                </div>
              ) : projectSummaries.length === 0 ? (
                <div className="p-4 text-center text-sm text-zinc-400">
                  저장된 프로젝트가 없습니다.
                </div>
              ) : (
                <ul className="space-y-1">
                  {projectSummaries.map((summary) => (
                    <li
                      key={summary.id}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 ${
                        summary.id === project.id
                          ? "bg-zinc-100"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openProjectFromList(summary.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {summary.name}
                          {summary.id === project.id ? " (현재 열림)" : ""}
                        </div>
                        <div className="truncate text-xs text-zinc-500">
                          {summary.timelineStart} ~ {summary.timelineEnd} ·
                          Work Item {summary.workItemCount}개
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectDeleteConfirmId(summary.id)}
                        className="shrink-0 text-xs text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-zinc-200 p-3">
              <button
                type="button"
                onClick={createNewProject}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                + 새 프로젝트 만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {projectDeleteConfirmId && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">프로젝트 삭제</h2>
            <p className="mt-2 text-sm text-zinc-600">
              &ldquo;
              {
                projectSummaries.find((s) => s.id === projectDeleteConfirmId)
                  ?.name
              }
              &rdquo; 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수
              없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProjectDeleteConfirmId(null)}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDeleteProjectFromList}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImport && isOverwritePreviewOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="border-b border-zinc-200 p-5 pb-4">
              <h2 className="text-base font-semibold">덮어쓰기 내용 확인</h2>
              <p className="mt-2 text-sm text-zinc-600">
                이 작업은 현재 프로젝트를 Excel 파일 내용으로 교체합니다. 아래
                항목이 실제로 추가/수정/삭제됩니다 — 특히{" "}
                <span className="font-semibold text-red-600">
                  삭제되는 항목은 되돌릴 수 없습니다.
                </span>
              </p>
            </div>
            <div className="flex-1 space-y-4 overflow-auto p-5">
              <div>
                <h3 className="text-xs font-semibold text-zinc-400">
                  Work Item
                </h3>
                <div className="mt-2 space-y-3">
                  {renderDiffEntryList(
                    "추가",
                    pendingImportDiff?.workItems.added ?? [],
                    "add"
                  )}
                  {renderDiffEntryList(
                    "수정",
                    pendingImportDiff?.workItems.modified ?? [],
                    "modify"
                  )}
                  {renderDiffEntryList(
                    "삭제",
                    pendingImportDiff?.workItems.deleted ?? [],
                    "delete"
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-zinc-400">
                  체크포인트
                </h3>
                <div className="mt-2 space-y-3">
                  {renderDiffEntryList(
                    "추가",
                    pendingImportDiff?.checkpoints.added ?? [],
                    "add"
                  )}
                  {renderDiffEntryList(
                    "수정",
                    pendingImportDiff?.checkpoints.modified ?? [],
                    "modify"
                  )}
                  {renderDiffEntryList(
                    "삭제",
                    pendingImportDiff?.checkpoints.deleted ?? [],
                    "delete"
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 p-4">
              <button
                type="button"
                onClick={() => setIsOverwritePreviewOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                뒤로
              </button>
              <button
                type="button"
                onClick={() => applyPendingImport("overwrite")}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                그래도 덮어쓰기
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImport && !isOverwritePreviewOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Excel 불러오기</h2>
            <p className="mt-2 text-sm text-zinc-600">
              &ldquo;{pendingImport.name}&rdquo; ({pendingImport.workItems.length}개
              항목)를 어떻게 불러올까요?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => applyPendingImport("new")}
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                새 프로젝트로 불러오기
                <span className="mt-0.5 block text-xs font-normal text-zinc-300">
                  현재 프로젝트는 그대로 두고, Excel 데이터를 별도의 새
                  프로젝트로 만듭니다.
                </span>
              </button>
              <button
                type="button"
                onClick={handleOverwriteImportClick}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                현재 프로젝트에 덮어쓰기
                <span className="mt-0.5 block text-xs font-normal text-zinc-400">
                  지금 열려 있는 프로젝트의 데이터를 Excel 데이터로
                  교체합니다.
                </span>
              </button>
              <button
                type="button"
                onClick={cancelPendingImport}
                className="w-full rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">가져오기 실패</h2>
            <p className="mt-2 text-sm text-zinc-600">{importError}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setImportError(null)}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {exportError && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">내보내기 실패</h2>
            <p className="mt-2 text-sm text-zinc-600">{exportError}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setExportError(null)}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileOptimizedNotice />
    </main>
  );
}
