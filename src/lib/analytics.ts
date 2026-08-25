import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client-side, best-effort analytics. Every failure mode here (missing env
// vars, no network, Supabase error, storage unavailable) is swallowed so it
// can never break the app's core features — see trackEvent().

const ANONYMOUS_USER_ID_STORAGE_KEY = "todo-line-anonymous-user-id";
const SESSION_ID_STORAGE_KEY = "todo-line-session-id";
const ANALYTICS_EVENTS_TABLE = "analytics_events";

export type AnalyticsEventType =
  // PROJECT
  | "project_create"
  | "project_open"
  | "project_switch"
  | "project_export"
  // ITEM
  | "item_add"
  | "item_delete"
  | "item_move"
  | "item_change"
  // TIMELINE
  | "timeline_move"
  | "timeline_resize"
  // AI
  | "ai_panel_open"
  | "ai_schedule"
  | "ai_schedule_fail"
  | "ai_review"
  | "ai_review_fail"
  | "ai_result_reopen"
  // UI
  | "help_open"
  | "zoom_in"
  | "zoom_out";

let supabaseClient: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient !== undefined) return supabaseClient;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    supabaseClient = url && publishableKey ? createClient(url, publishableKey) : null;
  } catch (error) {
    console.warn("[analytics] failed to create Supabase client:", error);
    supabaseClient = null;
  }

  return supabaseClient;
}

/** Reads (or creates on first visit) this browser's anonymous id. No PII involved — a random UUID stored in localStorage. */
export function getAnonymousUserId(): string | null {
  try {
    if (typeof window === "undefined") return null;

    const existing = window.localStorage.getItem(ANONYMOUS_USER_ID_STORAGE_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    window.localStorage.setItem(ANONYMOUS_USER_ID_STORAGE_KEY, created);
    return created;
  } catch (error) {
    console.warn("[analytics] failed to resolve anonymous user id:", error);
    return null;
  }
}

/** Reads (or creates on first use this tab) this tab's session id, stored in sessionStorage so a new tab/session gets a fresh id. */
export function getSessionId(): string | null {
  try {
    if (typeof window === "undefined") return null;

    const existing = window.sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_ID_STORAGE_KEY, created);
    return created;
  } catch (error) {
    console.warn("[analytics] failed to resolve session id:", error);
    return null;
  }
}

export type TrackEventInput = {
  eventType: AnalyticsEventType;
  projectId?: string | null;
};

async function sendAnalyticsEvent({ eventType, projectId }: TrackEventInput): Promise<void> {
  try {
    const client = getSupabaseClient();
    if (!client) return;

    const anonymousUserId = getAnonymousUserId();
    const sessionId = getSessionId();
    if (!anonymousUserId || !sessionId) return;

    const { error } = await client.from(ANALYTICS_EVENTS_TABLE).insert({
      anonymous_user_id: anonymousUserId,
      session_id: sessionId,
      project_id: projectId ?? null,
      event_type: eventType,
    });

    if (error) console.warn("[analytics] insert failed:", error.message);
  } catch (error) {
    console.warn("[analytics] trackEvent failed:", error);
  }
}

/**
 * Fire-and-forget behavioral event insert into Supabase `analytics_events`.
 * Never throws and never blocks the caller on network I/O — any failure
 * (missing config, offline, Supabase error) is logged as a warning only.
 * Only anonymous ids + event metadata are sent; never project content.
 */
export function trackEvent(input: TrackEventInput): void {
  void sendAnalyticsEvent(input);
}
