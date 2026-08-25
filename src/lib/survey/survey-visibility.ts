// Client-side re-show cooldown for SatisfactionSurvey, kept per-browser in
// localStorage (same storage mechanism analytics.ts uses for its anonymous
// id — see getAnonymousUserId there). Never throws; every failure mode
// (no window, storage unavailable) is swallowed, matching that pattern.

const SURVEY_NEXT_AVAILABLE_AT_STORAGE_KEY = "survey_next_available_at";
const DISMISS_COOLDOWN_MS = 10 * 60 * 60 * 1000; // 10 hours
const SUBMIT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function setSurveyNextAvailableAt(nextAvailableAt: Date): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SURVEY_NEXT_AVAILABLE_AT_STORAGE_KEY,
      nextAvailableAt.toISOString()
    );
  } catch (error) {
    console.warn("[satisfaction-survey] failed to save re-show cooldown:", error);
  }
}

/** Call when the survey is dismissed without being submitted (닫기/나중에 하기/배경 클릭/Esc). */
export function markSurveyDismissed(): void {
  setSurveyNextAvailableAt(new Date(Date.now() + DISMISS_COOLDOWN_MS));
}

/** Call only after a confirmed successful survey_responses INSERT. */
export function markSurveySubmitted(): void {
  setSurveyNextAvailableAt(new Date(Date.now() + SUBMIT_COOLDOWN_MS));
}

/** Whether enough time has passed since the last dismiss/submit to show the survey again (true if it has never been shown). */
export function canShowSurvey(): boolean {
  try {
    if (typeof window === "undefined") return false;

    const stored = window.localStorage.getItem(SURVEY_NEXT_AVAILABLE_AT_STORAGE_KEY);
    if (!stored) return true;

    const nextAvailableAt = new Date(stored).getTime();
    if (Number.isNaN(nextAvailableAt)) return true;

    return Date.now() >= nextAvailableAt;
  } catch (error) {
    console.warn("[satisfaction-survey] failed to read re-show cooldown:", error);
    return false;
  }
}
