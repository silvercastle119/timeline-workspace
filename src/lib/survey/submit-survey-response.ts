import { getAnonymousUserId, getSessionId, getSupabaseClient } from "@/lib/analytics";

const SURVEY_RESPONSES_TABLE = "survey_responses";

export type SubmitSurveyResponseInput = {
  satisfaction: number;
  helpfulness: number;
  opinion: string;
  projectId: string | null;
};

export type SubmitSurveyResponseResult = { ok: true } | { ok: false };

/**
 * Insert one row into Supabase `survey_responses`. Reuses the same lazily
 * created client and anonymous id/session id as analytics.ts so this stays
 * on one identity per browser/tab. Never throws — every failure mode
 * (missing env vars, no ids, offline, Supabase error) resolves to
 * `{ ok: false }` so the caller can surface a UI error state.
 */
export async function submitSurveyResponse(
  input: SubmitSurveyResponseInput
): Promise<SubmitSurveyResponseResult> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      console.error("[satisfaction-survey] Supabase client unavailable (missing env vars?)");
      return { ok: false };
    }

    const anonymousUserId = getAnonymousUserId();
    const sessionId = getSessionId();
    if (!anonymousUserId || !sessionId) {
      console.error("[satisfaction-survey] missing anonymous_user_id or session_id");
      return { ok: false };
    }

    const { error } = await client.from(SURVEY_RESPONSES_TABLE).insert({
      anonymous_user_id: anonymousUserId,
      session_id: sessionId,
      project_id: input.projectId,
      satisfaction_score: input.satisfaction,
      usefulness_score: input.helpfulness,
      feedback: input.opinion || null,
    });

    if (error) {
      console.error("[satisfaction-survey] insert failed:", error.message);
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.error("[satisfaction-survey] submit failed:", error);
    return { ok: false };
  }
}
