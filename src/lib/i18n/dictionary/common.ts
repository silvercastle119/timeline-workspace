/**
 * Shared UI strings used across both the desktop and mobile surfaces.
 * Key = the Korean source string, value = its English translation.
 */
export const common: Record<string, string> = {
  // Actions
  저장: "Save",
  취소: "Cancel",
  삭제: "Delete",
  수정: "Edit",
  추가: "Add",
  닫기: "Close",
  확인: "OK",
  "실행 취소": "Undo",
  "다시 실행": "Redo",
  편집: "Edit",
  뒤로: "Back",
  완료: "Done",

  // Status
  저장됨: "Saved",
  "저장 중...": "Saving…",

  // Language switch
  한국어: "한국어",
  English: "English",

  // Mobile-optimized notice (shown on the desktop app at narrow widths)
  "안내 닫기": "Close notice",
  "데스크탑에 최적화된 화면이에요": "This screen is optimized for desktop",
  "TO-DO-LINE은 아직 모바일 화면을 지원하지 않아요. 태블릿이나 노트북에서 이용해주시면 더 편하게 쓰실 수 있습니다.":
    "TO-DO-LINE doesn't support mobile screens yet. It's easier to use on a tablet or laptop.",
  확인했어요: "Got it",

  // Feedback report modal (shared PC / mobile)
  "오류 신고 · 개선 제안": "Report a bug · Suggest an improvement",
  "오류 신고 및 개선 제안": "Report",
  "피드백 닫기": "Close feedback",
  "소중한 의견을 보내주셔서 감사합니다.": "Thank you for your feedback.",
  내용: "Details",
  "불편했던 점이나 개선되었으면 하는 점을 자유롭게 적어주세요.":
    "Tell us anything that felt awkward or that you'd like improved.",
  "전송에 실패했습니다. 잠시 후 다시 시도해주세요.":
    "Sending failed. Please try again in a moment.",
  "제출 중...": "Submitting…",
  제출하기: "Submit",
  유형: "Type",
  "피드백 유형": "Feedback type",
  "오류 신고": "Bug report",
  "개선 제안": "Improvement idea",
  "기타 의견": "Other feedback",

  // AI panel (shared PC / mobile)
  "AI 기능 (베타)": "AI features (beta)",
  "✨ AI 기능": "✨ AI features",
  "현재 베타 테스트 중인 기능입니다.": "This feature is currently in beta.",
  "AI 패널 닫기": "Close AI panel",
  "TO-DO-LINE의 프로젝트 데이터를 바탕으로 AI의 도움을 받아 일정을 작성하고 프로젝트를 검토할 수 있습니다. AI 처리를 위해 현재 프로젝트의 업무 구조와 일정 정보가 외부 LLM으로 전송됩니다.":
    "Using your TO-DO-LINE project data, AI can help you draft schedules and review your project. For AI processing, the current project's work structure and schedule information is sent to an external LLM.",
  "AI 일정 채우기": "AI schedule fill",
  "직접 선택한 업무에 대해서만 일정을 제안합니다. 선택하지 않은 업무는 AI가 변경하지 않습니다.":
    "Schedules are suggested only for tasks you select. AI won't change tasks you don't select.",
  "프로젝트 검토하기": "Review the project",
  "완성된 프로젝트 구조와 일정을 AI에게 검토받습니다.":
    "Have AI review your finished project structure and schedule.",
  "✨ AI 일정 채우기": "✨ AI schedule fill",
  "✨ 프로젝트 검토": "✨ Project review",
  "← 뒤로": "← Back",
  "AI가 분석하고 있습니다...": "AI is analyzing…",
  "자동 반영": "Auto-reflected",
  미정: "TBD",
  "대상 다시 선택": "Reselect targets",
  "다시 시도": "Try again",
  "적용 가능한 일정 제안이 없습니다.": "There are no applicable schedule suggestions.",
  "검토가 필요해 제외된 항목 {count}건": "{count} item(s) excluded pending review",
  "알 수 없는 항목": "Unknown item",
  적용하기: "Apply",
  "프로젝트 조건 (선택)": "Project conditions (optional)",
  "예: 참여 인원, 업무 강도 및 난이도, 업무 종료 일자, 업무 불가 기간, 업무 특이사항 등":
    "e.g. number of participants, task intensity and difficulty, task end date, unavailable periods, task notes, etc.",
  "이번 초안 생성 1회에만 적용되며 저장되지 않습니다. 개별 업무의 메모도 함께 참고합니다.":
    "Applies only to this one draft and isn't saved. Individual task memos are also taken into account.",
  "체크된 업무만 AI가 일정을 제안합니다. 이미 일정이 있는 업무도 체크하면 새 일정으로 덮어쓸 수 있으니, 그대로 유지하고 싶은 업무는 체크를 해제하세요. (하위 일정 자동 반영 업무는 선택할 수 없습니다.)":
    "AI suggests schedules only for checked tasks. Checking a task that already has a schedule can overwrite it, so uncheck any task you want to keep as-is. (Tasks with auto-reflected sub-schedules can't be selected.)",
  "전체 선택": "Select all",
  "전체 해제": "Clear all",
  "선택한 {count}개 업무로 AI에게 요청 →": "Ask AI for the {count} selected task(s) →",
  "AI가 특별히 확인이 필요하다고 판단한 항목이 없습니다.":
    "AI didn't flag anything as particularly needing attention.",
  "아직 검토 결과가 없습니다.": "No review results yet.",
  "{time} 검토 결과": "Review from {time}",
  "이전 검토 기록 {count}건": "{count} earlier review(s)",
  "↻ 새로 검토하기": "↻ Run a new review",

  // AI errors
  "AI가 제안할 수 있는 일정을 찾지 못했습니다.":
    "AI couldn't find any schedules to suggest.",
  "AI 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.":
    "Couldn't reach the AI server. Please try again in a moment.",
  "지금 AI 요청이 많습니다. 잠시 후 다시 시도해주세요.":
    "There are a lot of AI requests right now. Please try again in a moment.",
  "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.":
    "The AI response timed out. Please try again in a moment.",
  "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.":
    "Couldn't process the request. Please try again in a moment.",
  "AI 기능이 아직 설정되지 않았습니다. 잠시 후 다시 시도해도 안 되면 관리자에게 문의해주세요.":
    "AI features aren't set up yet. If it still doesn't work after a moment, please contact an administrator.",

  // AI schedule suggestion flags (from validate-schedule-suggestions.ts)
  "존재하지 않는 Work Item id입니다.": "This Work Item id doesn't exist.",
  "동일 항목에 대한 중복 제안입니다.": "Duplicate suggestion for the same item.",
  "하위 일정 자동 반영 항목은 직접 일정을 지정할 수 없습니다.":
    "Items with auto-reflected sub-schedules can't be scheduled directly.",
  "AI 제안 대상으로 선택하지 않은 항목입니다.":
    "This item wasn't selected as an AI suggestion target.",
  "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)":
    "The date format is invalid. (YYYY-MM-DD)",
  "프로젝트 전체 기간을 벗어난 일정입니다.":
    "This schedule falls outside the project's overall period.",

  // AI review severities
  "확인 필요": "Needs review",
  주의: "Caution",
  참고: "For reference",

  // AI 업무 구조 만들기 (work structure builder)
  "AI 업무 구조 만들기": "AI work structure builder",
  "프로젝트 설명을 입력하면 AI가 업무 구조 초안을 만들어 드립니다. 검토 후 원하는 업무만 Work Tree에 반영할 수 있습니다.":
    "Describe your project and AI will draft a task structure. Review it and add only the tasks you want to your Work Tree.",
  "✨ AI 업무 구조 만들기": "✨ AI work structure builder",
  "어떤 프로젝트인가요?": "What kind of project is this?",
  "예: 디지털마케팅, 신제품 출시, 대학 축제 기획, 신규 웹사이트 제작, 인스타그램 채널 운영":
    "e.g. digital marketing, new product launch, university festival planning, new website build, Instagram channel operation",
  "이 프로젝트에서 반드시 수행해야 하는 과업을 알려주세요. (선택)":
    "Tell us the tasks/work areas this project absolutely must cover. (optional)",
  "예: 인스타그램, 유튜브, X, 온라인 쇼룸, 인플루언서 마케팅":
    "e.g. Instagram, YouTube, X, online showroom, influencer marketing",
  "쉼표(,) 또는 줄바꿈으로 구분해서 여러 개를 입력할 수 있습니다.":
    "Separate multiple items with commas or line breaks.",
  "업무를 얼마나 세부적으로 나눌까요?": "How detailed should the tasks be?",
  "대략적으로": "Roughly",
  "세부적으로": "In detail",
  "큰 단위의 업무 중심": "Broad, high-level tasks",
  "주요 업무 중심": "Major tasks",
  "일반적인 업무 단위": "Typical task breakdown",
  "실행 단위까지 세부적으로 분류": "Detailed down to actionable tasks",
  "최대한 세부적으로 분류": "As detailed as possible",
  "AI에게 업무 구조 요청 →": "Ask AI for a task structure →",
  "입력 다시 확인": "Check the inputs again",
  "AI가 제안할 업무를 찾지 못했습니다.": "AI couldn't come up with any tasks to suggest.",
  "입력한 필수 과업 {requiredCount}개를 분석하여 {groupCount}개의 업무 영역과 {totalCount}개의 업무로 구성했습니다.":
    "Analyzed your {requiredCount} required task(s) and organized them into {groupCount} work area(s) with {totalCount} task(s) total.",
  "AI가 프로젝트를 분석해 {groupCount}개의 업무 영역과 {totalCount}개의 업무를 제안했습니다.":
    "AI analyzed the project and suggested {groupCount} work area(s) with {totalCount} task(s) total.",
  "다음 필수 과업이 결과에 반영되지 않은 것 같습니다: {tasks}. 확인 후 필요하면 직접 추가해주세요.":
    "These required tasks don't seem to be reflected in the result: {tasks}. Please check and add them manually if needed.",
  "제안된 업무가 모두 삭제되었습니다.": "All suggested tasks have been removed.",
  "선택한 {count}개 업무 반영": "Add the {count} selected task(s)",
  "기존 업무와 이름 중복": "Duplicates an existing task name",
  "업무 삭제": "Delete task",
  "다시 만들기 / 이어 만들기": "Start over / Continue building",
  "다시 만들기": "Start over",
  "이어 만들기": "Continue building",
  "반영하면 기존 Work Tree를 모두 지우고 새로 만듭니다.":
    "Applying will clear the entire existing Work Tree and rebuild it from scratch.",
  "반영하면 기존 Work Tree 아래에 이어서 추가됩니다.":
    "Applying will add these below the existing Work Tree.",
  "기존에 있던 업무가 모두 삭제되고 선택한 업무로 Work Tree가 새로 만들어집니다. 되돌릴 수 없습니다.":
    "All existing tasks will be deleted and the Work Tree will be rebuilt from the selected tasks. This cannot be undone.",
  "초기화하고 반영하기": "Reset and apply",
};
