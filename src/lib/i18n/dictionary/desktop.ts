/**
 * Desktop-only UI strings (src/app/page.tsx and desktop-only components).
 * Key = the Korean source string, value = its English translation.
 * Guide / FAQ prose lives in src/lib/i18n/guide-content.tsx instead.
 */
export const desktop: Record<string, string> = {
  // Header / toolbar
  실행취소: "Undo",
  다시실행: "Redo",
  축소: "Zoom out",
  확대: "Zoom in",
  "내보내는 중...": "Exporting…",
  "Excel로 내보내기": "Export to Excel",
  "불러오는 중...": "Loading…",
  "Excel 불러오기": "Import from Excel",
  "내 프로젝트": "My projects",
  "프로젝트명 편집": "Edit project name",
  "Timeline 기간 편집": "Edit Timeline period",

  // Work Items tree
  펼치기: "expand",
  접기: "collapse",
  "+ 항목 추가": "+ Add item",
  "일정 미정": "Schedule TBD",

  // Detail panel
  "항목 비활성화": "Deactivate item",
  "항목 활성화": "Activate item",
  항목명: "Name",
  색상: "Color",
  "색상 {color} 선택": "Select color {color}",
  "사용자 지정 색상 추가": "Add a custom color",
  "하위 일정 자동 반영": "Auto-reflect sub-schedules",
  "하위 일정으로 자동 계산됨:": "Auto-calculated from sub-schedules:",
  "하위 일정이 없어 기간을 계산할 수 없습니다.":
    "No sub-schedules, so the period can't be calculated.",
  시작일: "Start date",
  종료일: "End date",
  체크포인트: "Checkpoints",
  "시작일/종료일이 지정된 일정에서만 체크포인트를 추가할 수 있습니다.":
    "Checkpoints can only be added to schedules that have a start and end date.",
  라벨: "Label",
  "체크포인트 삭제": "Delete checkpoint",
  "+ 체크포인트 추가": "+ Add checkpoint",
  메모: "Memo",
  "메모 입력": "Enter a memo",
  "하위 항목 이름을 입력하고 Enter 또는 추가를 누르세요":
    "Type a sub-item name and press Enter or Add",
  "{name} 취소": "Remove {name}",
  "하위 항목 이름": "Sub-item name",
  "+ 하위 항목 추가": "+ Add sub-item",
  "항목 삭제": "Delete item",

  // New item defaults
  "새 항목": "New item",
  "새 하위 항목": "New sub-item",

  // Default project seed data (new project example content)
  디지털마케팅: "Digital Marketing",
  시장조사: "Market Research",
  기획: "Planning",
  디자인: "Design",

  // Guide FAB / modal chrome
  "TO-DO-LINE 사용 설명서": "TO-DO-LINE guide",
  "업무를 잇고, 흐름을 보다.": "Connect tasks, see the flow.",
  "상단 메뉴에서 원하는 내용을 선택하면 해당 위치로 이동할 수 있습니다.":
    "Pick a topic from the menu above to jump to that section.",
  "전체 설명": "Full guide",
  "프로젝트를 시작하는 단계부터 Excel 내보내기까지, 전체 사용 흐름을 순서대로 확인할 수 있습니다.":
    "Walk through the whole flow in order, from starting a project to exporting to Excel.",
  "요약 설명": "Quick summary",
  "핵심적인 조작 방법만 짧게 확인하고 싶다면 아래 요약을 참고하세요.":
    "If you just want the key actions in brief, see the summary below.",
  "자주 묻는 질문": "FAQ",
  "질문을 클릭하면 답변이 펼쳐집니다.": "Click a question to expand its answer.",

  // Delete Work Item modal
  "Work Item 삭제": "Delete Work Item",
  "{name}와 하위 업무 {count}개를 삭제하시겠습니까?":
    "Delete “{name}” and its {count} sub-task(s)?",

  // Project list modal
  "⚠️ 이 프로젝트들은 현재 사용 중인 기기의 이 브라우저에만 저장됩니다. 브라우저 데이터(캐시/사이트 데이터)를 삭제하면 프로젝트를 복구할 수 없습니다.":
    "⚠️ These projects are stored only in this browser on the device you're using. Clearing your browser data (cache / site data) makes them unrecoverable.",
  "저장된 프로젝트가 없습니다.": "No saved projects.",
  " (현재 열림)": " (currently open)",
  "Work Item {count}개": "{count} Work Item(s)",
  "+ 새 프로젝트 만들기": "+ Create a new project",

  // Delete project modal
  "프로젝트 삭제": "Delete project",
  "“{name}” 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.":
    "Delete the project “{name}”? This can't be undone.",

  // Overwrite preview modal
  "덮어쓰기 내용 확인": "Review overwrite changes",
  "이 작업은 현재 프로젝트를 Excel 파일 내용으로 교체합니다. 아래 항목이 실제로 추가/수정/삭제됩니다 — 특히":
    "This replaces the current project with the contents of the Excel file. The items below are actually added / modified / deleted — in particular,",
  "삭제되는 항목은 되돌릴 수 없습니다.": "deleted items can't be recovered.",
  "그래도 덮어쓰기": "Overwrite anyway",

  // Import choice modal
  "“{name}” ({count}개 항목)를 어떻게 불러올까요?":
    "How do you want to import “{name}” ({count} items)?",
  "새 프로젝트로 불러오기": "Import as a new project",
  "현재 프로젝트는 그대로 두고, Excel 데이터를 별도의 새 프로젝트로 만듭니다.":
    "Keeps the current project as-is and creates the Excel data as a separate new project.",
  "현재 프로젝트에 덮어쓰기": "Overwrite the current project",
  "지금 열려 있는 프로젝트의 데이터를 Excel 데이터로 교체합니다.":
    "Replaces the data of the project you have open with the Excel data.",
  "가져오기 실패": "Import failed",
  "내보내기 실패": "Export failed",

  // Diff entry list
  "{count}개": "{count}",
  "외 {count}개": "and {count} more",
  "(이름 없음)": "(no name)",

  // Errors
  "Timeline 시작일과 종료일을 모두 입력해주세요.":
    "Please enter both a Timeline start date and end date.",
  "Timeline 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)":
    "The Timeline date format is invalid. (YYYY-MM-DD)",
  "Timeline 시작일은 종료일보다 늦을 수 없습니다.":
    "The Timeline start date can't be later than the end date.",
  "Timeline 기간이 너무 깁니다. 최대 {years}년까지 설정할 수 있습니다.":
    "The Timeline period is too long. You can set it to at most {years} years.",
  "Excel 파일을 내보내는 중 오류가 발생했습니다.":
    "Something went wrong while exporting the Excel file.",
  "파일 크기가 너무 큽니다. 50MB 이하의 Excel 파일을 사용해주세요.":
    "The file is too large. Please use an Excel file of 50MB or less.",
  "Excel 파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.":
    "The Excel file couldn't be read. It may be corrupted or in an unsupported format.",
  "Timeline Workspace에서 내보낸 파일인지 확인해주세요.":
    "Please check that this file was exported from Timeline Workspace.",
  "이 파일에서 날짜 표를 찾을 수 없습니다. Timeline Workspace에서 내보낸 파일인지 확인해주세요.":
    "No date table was found in this file. Please check that it was exported from Timeline Workspace.",
  "가져올 Work Item이 없습니다.": "There are no Work Items to import.",

  // Satisfaction survey modal
  "만족도 조사": "Satisfaction survey",
  "만족도 조사 닫기": "Close satisfaction survey",
  "전반적으로 얼마나 만족하시나요?": "How satisfied are you overall?",
  "업무에 얼마나 도움이 되었나요?": "How much did it help with your work?",
  "개선 의견": "Suggestions",
  "(선택)": "(optional)",
  "더 나아졌으면 하는 점을 자유롭게 남겨주세요.":
    "Feel free to share anything you'd like improved.",
  "의견을 보내지 못했습니다. 잠시 후 다시 시도해주세요.":
    "Couldn't send your feedback. Please try again in a moment.",
  "나중에 하기": "Later",
  "보내는 중...": "Sending…",
  "의견 보내기": "Send feedback",
  "매우 불만족": "Very dissatisfied",
  불만족: "Dissatisfied",
  보통: "Neutral",
  만족: "Satisfied",
  "매우 만족": "Very satisfied",
  "전혀 도움 안 됨": "Not helpful at all",
  "별로 도움 안 됨": "Not very helpful",
  "도움이 됨": "Helpful",
  "매우 도움이 됨": "Very helpful",
};
