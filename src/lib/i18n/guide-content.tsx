"use client";

/* eslint-disable react/no-unescaped-entities */

import { useState, type ReactNode } from "react";
import type { Language } from "./language";

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

const B = ({ children }: { children: ReactNode }) => (
  <b className="text-zinc-900">{children}</b>
);

export type GuideStepContent = {
  number: string;
  title: string;
  body: ReactNode;
};

export type GuideFaqItem = {
  question: string;
  answer: ReactNode;
};

export function getGuideTabs(lang: Language): readonly string[] {
  return lang === "en"
    ? (["Full guide", "Quick summary", "FAQ"] as const)
    : (["전체 설명", "요약 설명", "자주 묻는 질문"] as const);
}

// ---------------------------------------------------------------------------
// Full guide
// ---------------------------------------------------------------------------

const GUIDE_FULL_STEPS_KO: GuideStepContent[] = [
  {
    number: "01",
    title: "프로젝트를 시작하세요",
    body: (
      <>
        <p>
          <B>프로젝트명 설정</B>
          <br />
          화면 왼쪽 상단의 <B>프로젝트명 옆</B>{" "}
          <GuideKbd>✎</GuideKbd> <B>아이콘</B>을 클릭하여 프로젝트명을 설정합니다.
        </p>
        <p>
          <B>전체 Timeline 설정</B>
          <br />
          프로젝트명 아래 <GuideKbd>Timeline:</GuideKbd> <B>옆</B>{" "}
          <GuideKbd>✎</GuideKbd> <B>아이콘</B>을 클릭하여 프로젝트가 진행되는 전체
          기간을 설정합니다.
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
          화면 <B>왼쪽 하단의</B> <GuideKbd>+ 항목 추가</GuideKbd> <B>버튼</B>을
          클릭하여 프로젝트에서 진행할 주요 업무를 구성합니다.
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
          <B>프로젝트에서 어떤 업무를 어떤 구조로 진행할 것인지 구성하는 것</B>에
          집중합니다.
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
          먼저{" "}
          <B>왼쪽 Work Items에서 세부 업무를 추가할 상위 업무를 클릭</B>합니다.
        </p>
        <p>그러면 오른쪽에 Work Item 상세 패널이 열립니다.</p>
        <p>
          상세 패널 하단의 <GuideKbd>+ 하위 항목 추가</GuideKbd> <B>버튼</B>을
          클릭하여 필요한 세부 업무를 추가합니다.
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
          <B>
            상위 업무 클릭 → 우측 상세 패널 →{" "}
            <GuideKbd>+ 하위 항목 추가</GuideKbd>
          </B>
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
    title: "체크포인트",
    body: (
      <>
        <p>일정 중 특정 날짜를 중요한 시점으로 표시할 수 있습니다.</p>
        <p>
          체크포인트가 지정된 날짜는 <B>진한 색상과 굵은 글씨</B>로 표시됩니다.
        </p>
        <p>
          여러 날짜를 체크포인트로 지정할 수 있으며, 일정의 시작·중간·종료 시점
          어디에든 설정할 수 있습니다.
        </p>
        <p>
          일정이 설정된 Work Item을 클릭한 뒤 우측 상세 패널의{" "}
          <GuideKbd>+ 체크포인트 추가</GuideKbd> <B>버튼</B>을 클릭하여
          체크포인트를 추가할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "06",
    title: "Timeline의 막대를 직접 조정하세요",
    body: (
      <>
        <p>Timeline에 표시된 일정 막대를 직접 드래그하여 일정을 조정할 수 있습니다.</p>
        <p>
          <B>막대 전체를 이동하기</B>
          <br />
          막대의 가운데 부분을 잡고 드래그하면{" "}
          <B>업무의 시작일과 종료일을 함께 이동</B>할 수 있습니다.
        </p>
        <p>
          <B>업무 기간을 늘리거나 줄이기</B>
          <br />
          막대의 <B>왼쪽 또는 오른쪽 끝부분을 잡고 드래그</B>하면 업무 기간을
          조정할 수 있습니다.
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
    number: "07",
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
          이 경우 가장 먼저 시작하는 하위 업무가 <B>09.08</B>, 가장 늦게 끝나는
          하위 업무가 <B>10.02</B>이므로,
        </p>
        <GuideNote>
          <B>디자인: 09.08 ~ 10.02</B>
        </GuideNote>
        <p>로 상위 업무의 일정이 자동으로 반영됩니다.</p>
        <p>
          즉, <B>상위 업무의 시작일은 하위 업무 중 가장 이른 시작일</B>,{" "}
          <B>종료일은 가장 늦은 종료일</B>을 기준으로 설정됩니다.
        </p>
        <p>
          이를 통해 하위 업무의 일정만 관리해도 상위 업무가 차지하는{" "}
          <B>전체 작업 기간을 자동으로 확인</B>할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "08",
    title: "일정이 정해지지 않은 업무는 '일정 미정'으로 관리하세요",
    body: (
      <>
        <p>
          아직 일정이 확정되지 않은 업무는 날짜를 입력하지 않고{" "}
          <GuideKbd>일정 미정</GuideKbd>으로 관리할 수 있습니다.
        </p>
        <p>
          해당 Work Item을 클릭한 뒤 우측 상세 패널의{" "}
          <GuideKbd>일정 미정</GuideKbd> <B>체크박스</B>를 선택합니다.
        </p>
        <p>
          업무 구조에는 포함하면서 일정이 아직 확정되지 않은 업무를 별도로
          관리할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "09",
    title: "전체적인 프로젝트 흐름을 확인하세요",
    body: (
      <>
        <p>
          업무와 일정을 모두 입력했다면 Timeline을 통해 프로젝트 전체 흐름을
          확인합니다.
        </p>
        <p>
          왼쪽에서는 <B>업무의 구조와 위계</B>를, 오른쪽에서는{" "}
          <B>업무의 시간적 흐름</B>을 확인할 수 있습니다.
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
          필요하다면 Timeline의 막대를 다시 드래그하거나 상세 패널에서 시작일과
          종료일을 수정하여 일정을 조정할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    number: "10",
    title: "프로젝트를 Excel로 내보내세요",
    body: (
      <>
        <p>
          프로젝트의 업무와 일정 구성을 완료했다면 화면 <B>오른쪽 상단의</B>{" "}
          <GuideKbd>Excel로 내보내기</GuideKbd> <B>버튼</B>을 클릭합니다.
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

const GUIDE_FULL_STEPS_EN: GuideStepContent[] = [
  {
    number: "01",
    title: "Start your project",
    body: (
      <>
        <p>
          <B>Set the project name</B>
          <br />
          Click the <GuideKbd>✎</GuideKbd> <B>icon</B> <B>next to the project
          name</B> in the top-left corner to name your project.
        </p>
        <p>
          <B>Set the overall Timeline</B>
          <br />
          Click the <GuideKbd>✎</GuideKbd> <B>icon</B> <B>next to</B>{" "}
          <GuideKbd>Timeline:</GuideKbd> below the project name to set the full
          period the project runs for.
        </p>
        <p>That period becomes the full range of the Timeline at the top of the screen.</p>
      </>
    ),
  },
  {
    number: "02",
    title: "Enter the project's work structure",
    body: (
      <>
        <p>
          Click the <GuideKbd>+ Add item</GuideKbd> <B>button</B> at the{" "}
          <B>bottom left</B> of the screen to lay out the main tasks in your
          project.
        </p>
        <p>For a website renewal project, for example:</p>
        <GuideExample>{`Planning
Design
Development
Content production
QA
Launch`}</GuideExample>
        <p>is the kind of top-level task list you can enter.</p>
        <p>
          At this stage, rather than entering detailed schedules for each task,
          focus on <B>laying out which tasks the project involves and how they
          are structured</B>.
        </p>
      </>
    ),
  },
  {
    number: "03",
    title: "Add sub-tasks to each task",
    body: (
      <>
        <p>
          First, <B>click the parent task in Work Items on the left that you
          want to add sub-tasks to</B>.
        </p>
        <p>The Work Item detail panel then opens on the right.</p>
        <p>
          Click the <GuideKbd>+ Add sub-item</GuideKbd> <B>button</B> at the
          bottom of the detail panel to add the sub-tasks you need.
        </p>
        <p>
          If you selected <GuideKbd>Design</GuideKbd>, for example:
        </p>
        <GuideExample>{`Design
 ├─ Main page design
 ├─ Sub page design
 └─ Mobile design`}</GuideExample>
        <p>is one way to structure it.</p>
        <p>
          In the same way, select <GuideKbd>Development</GuideKbd>:
        </p>
        <GuideExample>{`Development
 ├─ Frontend development
 ├─ CMS integration
 └─ Responsive support`}</GuideExample>
        <p>and add sub-tasks like this.</p>
        <p>In other words,</p>
        <GuideNote>
          <B>
            click the parent task → detail panel on the right →{" "}
            <GuideKbd>+ Add sub-item</GuideKbd>
          </B>
        </GuideNote>
        <p>is the order in which you add sub-tasks.</p>
      </>
    ),
  },
  {
    number: "04",
    title: "Set a schedule for each task",
    body: (
      <>
        <p>Click the Work Item you want to schedule.</p>
        <p>
          Set the <GuideKbd>Start date</GuideKbd> and{" "}
          <GuideKbd>End date</GuideKbd> in the detail panel on the right.
        </p>
        <p>The schedule you enter appears as a bar on the Timeline.</p>
      </>
    ),
  },
  {
    number: "05",
    title: "Checkpoints",
    body: (
      <>
        <p>You can mark specific dates within a schedule as key moments.</p>
        <p>
          Dates set as checkpoints are shown in a <B>darker color and bold
          text</B>.
        </p>
        <p>
          You can set multiple dates as checkpoints, anywhere along the
          schedule — start, middle, or end.
        </p>
        <p>
          Click a Work Item that has a schedule, then click the{" "}
          <GuideKbd>+ Add checkpoint</GuideKbd> <B>button</B> in the detail panel
          on the right to add a checkpoint.
        </p>
      </>
    ),
  },
  {
    number: "06",
    title: "Adjust the Timeline bars directly",
    body: (
      <>
        <p>You can drag the schedule bars on the Timeline directly to adjust a schedule.</p>
        <p>
          <B>Move the whole bar</B>
          <br />
          Grab the middle of a bar and drag it to{" "}
          <B>move the task's start and end dates together</B>.
        </p>
        <p>
          <B>Extend or shorten a task</B>
          <br />
          <B>Grab and drag the left or right edge of a bar</B> to adjust the
          task's duration.
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Left edge → changes the start date</li>
          <li>Right edge → changes the end date</li>
        </ul>
        <p>
          So you can adjust a task's position and duration intuitively while
          looking at the Timeline, without typing dates.
        </p>
      </>
    ),
  },
  {
    number: "07",
    title: "Use auto-reflect from sub-schedules",
    body: (
      <>
        <p>
          Select the <GuideKbd>Auto-reflect sub-schedules</GuideKbd> checkbox in
          a parent task's detail panel, and the parent task's schedule follows
          its sub-tasks' schedules.
        </p>
        <p>For example:</p>
        <GuideExample>{`Design
 ├─ Main page design   09.08 ~ 09.18
 ├─ Sub page design    09.15 ~ 09.25
 └─ Mobile design      09.22 ~ 10.02`}</GuideExample>
        <p>
          Here the earliest-starting sub-task is <B>09.08</B> and the
          latest-ending sub-task is <B>10.02</B>, so
        </p>
        <GuideNote>
          <B>Design: 09.08 ~ 10.02</B>
        </GuideNote>
        <p>is automatically reflected as the parent task's schedule.</p>
        <p>
          That is, <B>the parent task's start date is the earliest start date
          among its sub-tasks</B>, and <B>the end date is the latest end
          date</B>.
        </p>
        <p>
          This way, managing only the sub-tasks' schedules lets you{" "}
          <B>automatically see the parent task's overall work period</B>.
        </p>
      </>
    ),
  },
  {
    number: "08",
    title: "Manage undated tasks as 'Schedule TBD'",
    body: (
      <>
        <p>
          For a task whose schedule isn't fixed yet, you can skip the dates and
          manage it as <GuideKbd>Schedule TBD</GuideKbd>.
        </p>
        <p>
          Click the Work Item, then select the{" "}
          <GuideKbd>Schedule TBD</GuideKbd> <B>checkbox</B> in the detail panel
          on the right.
        </p>
        <p>
          This keeps the task in the work structure while managing tasks whose
          schedules aren't confirmed yet separately.
        </p>
      </>
    ),
  },
  {
    number: "09",
    title: "Review the overall project flow",
    body: (
      <>
        <p>
          Once you've entered all tasks and schedules, use the Timeline to
          review the project's overall flow.
        </p>
        <p>
          The left side shows <B>the structure and hierarchy of the tasks</B>,
          and the right side shows <B>the tasks' flow over time</B>.
        </p>
        <p>The Timeline lets you take in the following at a glance:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>which task starts and ends when</li>
          <li>which tasks run in parallel</li>
          <li>whether work is concentrated in a particular period</li>
          <li>the order in which tasks follow one another</li>
          <li>whether the overall project schedule is well laid out</li>
        </ul>
        <p>
          If needed, drag the Timeline bars again or edit the start and end
          dates in the detail panel to adjust the schedule.
        </p>
      </>
    ),
  },
  {
    number: "10",
    title: "Export your project to Excel",
    body: (
      <>
        <p>
          Once you've finished laying out the project's tasks and schedules,
          click the <GuideKbd>Export to Excel</GuideKbd> <B>button</B> at the{" "}
          <B>top right</B> of the screen.
        </p>
        <p>
          You can export the project data you're currently managing in
          TO-DO-LINE as an Excel file.
        </p>
        <p>
          The exported Excel can be used to archive project materials, share
          tasks and schedules, and more.
        </p>
      </>
    ),
  },
];

// ---------------------------------------------------------------------------
// Quick summary
// ---------------------------------------------------------------------------

const GUIDE_SUMMARY_STEPS_KO: GuideStepContent[] = [
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
        Work Item 선택 → <GuideKbd>시작일</GuideKbd> / <GuideKbd>종료일</GuideKbd>{" "}
        설정
      </>
    ),
  },
  {
    number: "05",
    title: "체크포인트",
    body: (
      <>
        일정 상세 패널의 <GuideKbd>+ 체크포인트 추가</GuideKbd> → 특정 날짜를 진한
        색상·굵은 글씨로 강조
      </>
    ),
  },
  {
    number: "06",
    title: "Timeline 조정",
    body: <>막대 전체를 드래그하여 이동하거나 양끝을 드래그하여 기간 조정</>,
  },
  {
    number: "07",
    title: "하위 일정 자동 반영",
    body: (
      <>
        <GuideKbd>하위 일정 자동 반영</GuideKbd> 선택 → 하위 업무 일정에 따라 상위
        업무 일정 반영
      </>
    ),
  },
  {
    number: "08",
    title: "일정 미정",
    body: (
      <>
        <GuideKbd>일정 미정</GuideKbd> 선택 → 아직 날짜가 정해지지 않은 업무 관리
      </>
    ),
  },
  {
    number: "09",
    title: "전체 흐름 확인",
    body: <>Timeline에서 업무 구조와 시간 흐름 확인</>,
  },
  {
    number: "10",
    title: "Excel Export",
    body: (
      <>
        오른쪽 상단 <GuideKbd>Excel로 내보내기</GuideKbd> 클릭
      </>
    ),
  },
];

const GUIDE_SUMMARY_STEPS_EN: GuideStepContent[] = [
  {
    number: "01",
    title: "Project setup",
    body: (
      <>
        <GuideKbd>✎</GuideKbd> next to the project name → set the name /{" "}
        <GuideKbd>✎</GuideKbd> next to Timeline → set the full period
      </>
    ),
  },
  {
    number: "02",
    title: "Enter the work structure",
    body: (
      <>
        <GuideKbd>+ Add item</GuideKbd> at the bottom left → lay out the main
        tasks
      </>
    ),
  },
  {
    number: "03",
    title: "Add sub-tasks",
    body: (
      <>
        Select a parent task → detail panel on the right{" "}
        <GuideKbd>+ Add sub-item</GuideKbd>
      </>
    ),
  },
  {
    number: "04",
    title: "Set schedules",
    body: (
      <>
        Select a Work Item → set <GuideKbd>Start date</GuideKbd> /{" "}
        <GuideKbd>End date</GuideKbd>
      </>
    ),
  },
  {
    number: "05",
    title: "Checkpoints",
    body: (
      <>
        <GuideKbd>+ Add checkpoint</GuideKbd> in the schedule detail panel →
        highlight a specific date with a darker color and bold text
      </>
    ),
  },
  {
    number: "06",
    title: "Adjust the Timeline",
    body: (
      <>Drag the whole bar to move it, or drag either edge to adjust the duration</>
    ),
  },
  {
    number: "07",
    title: "Auto-reflect sub-schedules",
    body: (
      <>
        Select <GuideKbd>Auto-reflect sub-schedules</GuideKbd> → the parent
        task's schedule follows its sub-tasks
      </>
    ),
  },
  {
    number: "08",
    title: "Schedule TBD",
    body: (
      <>
        Select <GuideKbd>Schedule TBD</GuideKbd> → manage tasks whose dates
        aren't set yet
      </>
    ),
  },
  {
    number: "09",
    title: "Review the overall flow",
    body: <>Check the work structure and flow over time on the Timeline</>,
  },
  {
    number: "10",
    title: "Excel Export",
    body: (
      <>
        Click <GuideKbd>Export to Excel</GuideKbd> at the top right
      </>
    ),
  },
];

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const GUIDE_FAQ_ITEMS_KO: GuideFaqItem[] = [
  {
    question: "여러 막대를 한 번에 수정하려면 어떻게 하나요?",
    answer: (
      <>
        <p>
          여러 업무의 일정이나 정보를 한꺼번에 수정해야 하는 경우 Excel을
          활용할 수 있습니다.
        </p>
        <p>
          TO-DO-LINE에서 <GuideKbd>Excel로 내보내기</GuideKbd>한 뒤 필요한 내용을
          수정하고 <GuideKbd>Excel 불러오기</GuideKbd>로 다시 가져오는 방식으로
          여러 업무의 데이터를 한 번에 관리할 수 있습니다.
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
          기존에 TO-DO-LINE에서 <GuideKbd>Excel로 내보내기</GuideKbd>한 파일을
          열어 필요한 업무나 일정 데이터를 수정한 뒤{" "}
          <GuideKbd>Excel 불러오기</GuideKbd>로 다시 가져오면 됩니다.
        </p>
        <p>
          TO-DO-LINE에서 Export한 Excel은 서비스에서 사용하는 데이터 구조를 이미
          갖추고 있기 때문에, 새로운 Excel 파일을 처음부터 만드는 것보다 기존
          Export 파일을 수정하는 것이 편리합니다.
        </p>
      </>
    ),
  },
  {
    question: "업무의 위치를 바꾸고 싶어요.",
    answer: (
      <>
        <p>
          Work Item의 위치를 변경하여 프로젝트의 업무 구조를 정리할 수 있습니다.
        </p>
        <p>
          업무의 위치를 변경하면 동일한 그룹 안에서 업무의 순서를 조정하거나,
          다른 그룹으로 업무를 이동할 수 있습니다.
        </p>
        <p>
          왼쪽 Work Items 목록에서 옮기려는 업무를 눌러 원하는 위치로
          드래그합니다. 대상 업무 행의 위쪽에 놓으면 그 업무 위로, 아래쪽에 놓으면
          그 업무 아래로 순서가 바뀝니다. 목록의 왼쪽 가장자리에 놓으면 해당
          업무가 최상위로 이동합니다.
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
          이동할 업무를 눌러 원하는 상위 업무 행의 가운데 부분에 드래그하여 놓으면
          그 업무의 하위 항목으로 이동합니다. 업무의 위치를 변경할 때는 대상 행의
          위쪽/아래쪽 가장자리(순서만 변경)와 가운데(상위 그룹 변경)를 구분해서
          놓아야 합니다.
        </p>
      </>
    ),
  },
  {
    question: "일정 정보 데이터를 플랫폼 운영 측에서 열람하나요?",
    answer: (
      <p>
        TO-DO-LINE의 프로젝트 데이터는 별도의 서버로 전송되지 않고, 사용 중인
        브라우저의 로컬 저장소(IndexedDB)에만 저장됩니다. 따라서 플랫폼 운영
        측에서 해당 데이터를 열람할 수 없습니다.
      </p>
    ),
  },
  {
    question: "Timeline에서 업무 일정을 직접 옮길 수 있나요?",
    answer: (
      <p>
        네. Timeline의 일정 막대를 직접 드래그할 수 있습니다. 막대 전체를 잡고
        드래그하면 일정 전체가 이동하고, 막대의 양끝을 잡고 드래그하면 업무 기간을
        늘리거나 줄일 수 있습니다.
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
  {
    question: "다운로드한 Excel 파일을 수정해서 다시 가져올 수 있나요?",
    answer: (
      <>
        <p>
          네. 다운로드한 Excel 파일에서 일정의 날짜, 색상, 이름, 메모, 체크포인트,
          행 순서 등을 수정한 후 다시 가져올 수 있습니다.
        </p>
        <p>예를 들어 다음과 같은 수정이 가능합니다.</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>일정의 시작일·종료일 변경</li>
          <li>일정 막대의 색상 변경</li>
          <li>업무 이름 변경</li>
          <li>메모 내용 변경</li>
          <li>체크포인트 추가·삭제·이동</li>
          <li>업무(행) 순서 변경</li>
          <li>Work Item 추가·삭제</li>
        </ul>
        <p>
          변경된 내용은 <GuideKbd>Excel 불러오기</GuideKbd>로 가져오는 과정에서
          가져오기 전에 확인할 수 있으며, 확인 후 프로젝트에 반영됩니다.
        </p>
      </>
    ),
  },
];

const GUIDE_FAQ_ITEMS_EN: GuideFaqItem[] = [
  {
    question: "How do I edit several bars at once?",
    answer: (
      <>
        <p>
          When you need to edit the schedules or details of several tasks at
          once, you can use Excel.
        </p>
        <p>
          <GuideKbd>Export to Excel</GuideKbd> from TO-DO-LINE, edit what you
          need, and bring it back in with <GuideKbd>Import from Excel</GuideKbd>
          {" "}— this lets you manage many tasks' data at once.
        </p>
      </>
    ),
  },
  {
    question: "I want to edit an Excel file I already made.",
    answer: (
      <>
        <p>
          The most convenient approach is to reuse the structure of an Excel
          file exported from TO-DO-LINE as-is.
        </p>
        <p>
          Open a file you previously created with{" "}
          <GuideKbd>Export to Excel</GuideKbd> in TO-DO-LINE, edit the task or
          schedule data you need, and bring it back in with{" "}
          <GuideKbd>Import from Excel</GuideKbd>.
        </p>
        <p>
          An Excel file exported from TO-DO-LINE already has the data structure
          the service uses, so editing an existing export is more convenient than
          building a new Excel file from scratch.
        </p>
      </>
    ),
  },
  {
    question: "I want to change a task's position.",
    answer: (
      <>
        <p>
          You can change a Work Item's position to tidy up the project's work
          structure.
        </p>
        <p>
          Changing a task's position lets you reorder tasks within the same
          group, or move a task to a different group.
        </p>
        <p>
          In the Work Items list on the left, press the task you want to move and
          drag it to the position you want. Drop it above a target row to place
          it above that task, or below to place it below. Drop it at the left
          edge of the list to move the task to the top level.
        </p>
      </>
    ),
  },
  {
    question: "I want to move a task to a different group.",
    answer: (
      <>
        <p>Move a task under a different parent task to change its group.</p>
        <p>
          For example, moving a task that was under <GuideKbd>Planning</GuideKbd>{" "}
          to under <GuideKbd>Design</GuideKbd> changes that task's parent group.
        </p>
        <p>
          Press the task you want to move and drag it onto the middle of the
          target parent row to move it in as a sub-item of that task. When
          changing a task's position, be careful to distinguish dropping on the
          top/bottom edge of the target row (reorder only) from the middle
          (change the parent group).
        </p>
      </>
    ),
  },
  {
    question: "Can the platform operators view my schedule data?",
    answer: (
      <p>
        TO-DO-LINE's project data is not sent to any server — it is stored only
        in your browser's local storage (IndexedDB). The platform operators
        therefore cannot view that data.
      </p>
    ),
  },
  {
    question: "Can I move task schedules directly on the Timeline?",
    answer: (
      <p>
        Yes. You can drag the schedule bars on the Timeline directly. Grab and
        drag the whole bar to move the entire schedule; grab and drag either edge
        of the bar to extend or shorten the task's duration.
      </p>
    ),
  },
  {
    question: "Do sub-tasks' schedules reflect onto the parent task?",
    answer: (
      <p>
        If you select <GuideKbd>Auto-reflect sub-schedules</GuideKbd> in the
        parent task's detail panel, the sub-tasks' schedules are reflected onto
        the parent task.
      </p>
    ),
  },
  {
    question: "Can I edit a downloaded Excel file and import it again?",
    answer: (
      <>
        <p>
          Yes. You can edit a downloaded Excel file — schedule dates, colors,
          names, memos, checkpoints, row order, and so on — and import it again.
        </p>
        <p>For example, the following edits are possible:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>change a schedule's start/end date</li>
          <li>change a schedule bar's color</li>
          <li>change a task name</li>
          <li>change memo content</li>
          <li>add, delete, or move checkpoints</li>
          <li>reorder tasks (rows)</li>
          <li>add or delete Work Items</li>
        </ul>
        <p>
          Changes can be reviewed before importing during the{" "}
          <GuideKbd>Import from Excel</GuideKbd> process, and are applied to the
          project after you confirm.
        </p>
      </>
    ),
  },
];

export function getGuideFullSteps(lang: Language): GuideStepContent[] {
  return lang === "en" ? GUIDE_FULL_STEPS_EN : GUIDE_FULL_STEPS_KO;
}

export function getGuideSummarySteps(lang: Language): GuideStepContent[] {
  return lang === "en" ? GUIDE_SUMMARY_STEPS_EN : GUIDE_SUMMARY_STEPS_KO;
}

export function getGuideFaqItems(lang: Language): GuideFaqItem[] {
  return lang === "en" ? GUIDE_FAQ_ITEMS_EN : GUIDE_FAQ_ITEMS_KO;
}

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
