/**
 * Mobile-only UI strings (src/app/m/** and src/components/mobile/**).
 * Key = the Korean source string, value = its English translation.
 * Keys already defined in common.ts / desktop.ts (e.g. 저장, 취소, 불러오는 중...)
 * are reused via the merged dictionary and not repeated here.
 */
export const mobile: Record<string, string> = {
  // Tab bar / header
  목록: "List",
  타임라인: "Timeline",
  "메뉴 열기": "Open menu",
  "사용법 보기": "Open the guide",
  "사용법 닫기": "Close the guide",

  // Menu sheet
  메뉴: "Menu",
  "프로젝트 관리": "Manage projects",
  사용법: "Guide",
  언어: "Language",

  // Schedule (task detail) screen
  "업무를 찾을 수 없습니다.": "Task not found.",
  "목록으로 돌아가기": "Back to the list",
  "업무 설정": "Task settings",
  "활성 상태": "Active state",
  일정: "Schedule",
  "하위 업무 일정에 따라 자동으로 계산됩니다":
    "Calculated automatically from the sub-tasks' schedules",
  "색상 {color}": "Color {color}",
  "일정이 확정된 업무에서만 체크포인트를 설정할 수 있습니다.":
    "Checkpoints can only be set on tasks with a confirmed schedule.",
  "업무 삭제": "Delete task",
  "변경사항을 저장하지 않고 나가시겠습니까?": "Leave without saving your changes?",
  "지금 나가면 이번 화면에서 수정한 내용이 사라집니다.":
    "If you leave now, the edits you made on this screen will be lost.",
  나가기: "Leave",
  "“{name}” 업무를 삭제하시겠습니까?": "Delete the task “{name}”?",
  "하위 업무도 함께 삭제되며, 되돌릴 수 없습니다.":
    "Its sub-tasks are deleted too, and this can't be undone.",
  "삭제하면 되돌릴 수 없습니다.": "Once deleted, this can't be undone.",

  // Timeline bar / hierarchy / timeline screen
  "날짜를 설정해주세요": "Set a date",
  "등록된 업무가 없습니다.": "No tasks yet.",
  "+ 업무 추가": "+ Add task",
  "{name} 설정으로 이동": "Go to {name} settings",

  // Create project dialog
  "프로젝트명을 입력해주세요.": "Please enter a project name.",
  "새 프로젝트 만들기": "Create a new project",
  프로젝트명: "Project name",
  "전체 Timeline": "Overall Timeline",
  만들기: "Create",
  "새 프로젝트": "New project",
  "새 업무": "New task",

  // Project management sheet
  "프로젝트를 불러오지 못했습니다.": "Couldn't load the project.",
  "업무 {count}개": "{count} task(s)",
  현재: "Current",
  "전환 중...": "Switching…",
  "현재 프로젝트 설정": "Current project settings",
  "데이터 관리": "Data",
  "Excel 내보내기": "Export to Excel",
  "Excel 가져오기": "Import from Excel",
  "분석 중...": "Analyzing…",
  "Excel 내보내기에 실패했습니다.": "Excel export failed.",
  "파일 크기가 너무 큽니다.": "The file is too large.",
  "가져오기에 실패했습니다.": "Import failed.",
  "가져온 내용으로 덮어쓸까요?": "Overwrite with the imported content?",
  "업무: 추가 {added} · 수정 {modified} · 삭제 {deleted}":
    "Tasks: {added} added · {modified} modified · {deleted} deleted",
  "체크포인트: 추가 {added} · 수정 {modified} · 삭제 {deleted}":
    "Checkpoints: {added} added · {modified} modified · {deleted} deleted",
  덮어쓰기: "Overwrite",
};
