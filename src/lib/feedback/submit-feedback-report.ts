import { getAnonymousUserId, getSessionId, getSupabaseClient } from "@/lib/analytics";

const FEEDBACK_REPORTS_TABLE = "feedback_reports";

// Must match the `feedback_reports.feedback_type` check constraint in
// Supabase exactly (verified against the live table — it only accepts these
// three literal Korean labels, not English codes).
export type FeedbackType = "오류 신고" | "개선 제안" | "기타 의견";

export type SubmitFeedbackReportInput = {
  feedbackType: FeedbackType;
  content: string;
  projectId: string | null;
  pagePath: string;
  userAgent: string;
};

export type SubmitFeedbackReportResult = { ok: true } | { ok: false };

/**
 * Insert one row into Supabase `feedback_reports`. Reuses the same lazily
 * created client and anonymous id/session id as analytics.ts (see
 * submit-survey-response.ts for the same pattern applied to
 * `survey_responses`). Never throws — every failure mode (missing env vars,
 * no ids, offline, Supabase error) resolves to `{ ok: false }` so the caller
 * can surface a UI error state.
 */
export async function submitFeedbackReport(
  input: SubmitFeedbackReportInput
): Promise<SubmitFeedbackReportResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      console.error("[feedback-report] Supabase client unavailable (missing env vars?)");
      return { ok: false };
    }

    const anonymousUserId = getAnonymousUserId();
    const sessionId = getSessionId();
    if (!anonymousUserId || !sessionId) {
      console.error("[feedback-report] missing anonymous_user_id or session_id");
      return { ok: false };
    }

    const { error } = await client.from(FEEDBACK_REPORTS_TABLE).insert({
      anonymous_user_id: anonymousUserId,
      session_id: sessionId,
      project_id: input.projectId,
      feedback_type: input.feedbackType,
      content: input.content,
      page_path: input.pagePath,
      user_agent: input.userAgent,
    });

    if (error) {
      console.error("[feedback-report] insert failed:", error.message);
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.error("[feedback-report] submit failed:", error);
    return { ok: false };
  }
}
