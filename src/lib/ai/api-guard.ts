// Dependency-free defenses for the AI API routes (fill-schedule,
// review-project) against a caller that bypasses the client UI entirely
// (e.g. a raw curl POST) and never runs build-payload.ts's trimming.
// Server-only: only ever imported from route.ts (Route Handlers execute
// server-side), never from a client component.

// ~1MB — comfortably above a legitimate 500-workItem request (500 items x
// ~250 bytes/item of JSON overhead + capped name/memo <= ~150KB) with wide
// margin, while still rejecting deliberately oversized bodies before they're
// buffered/parsed.
const MAX_REQUEST_BODY_BYTES = 1_000_000;

/**
 * Cheap pre-parse guard using the Content-Length header. A client can omit
 * or lie about this header (chunked transfer, no header at all), so this is
 * a best-effort fast rejection, not a hard guarantee — the per-field length
 * checks in each route's parseRequestBody run after parsing regardless and
 * are what actually bounds the accepted payload.
 */
export function isRequestTooLarge(request: Request): boolean {
  const contentLength = request.headers.get("content-length");

  if (!contentLength) return false;

  const bytes = Number(contentLength);

  return Number.isFinite(bytes) && bytes > MAX_REQUEST_BODY_BYTES;
}

// In-memory fixed-window limiter. Tied to maxDuration=60 on both routes: a
// real user driving the actual UI can't fire more than a handful of these
// per minute even trying to, since each request already takes up to 60s to
// resolve — this leaves generous headroom above real usage while still
// throttling a scripted direct-POST loop.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
// Basic bound on unbounded Map growth from many distinct IPs; expired
// entries are swept before this would ever really get hit.
const MAX_TRACKED_KEYS = 5_000;

type WindowState = { count: number; windowStart: number };

const requestCounts = new Map<string, WindowState>();

function getClientKey(request: Request, routeName: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

  return `${routeName}:${ip}`;
}

function pruneExpiredEntries(now: number): void {
  for (const [key, state] of requestCounts) {
    if (now - state.windowStart >= WINDOW_MS) requestCounts.delete(key);
  }
}

/**
 * NOTE on deployment: this Map lives in one serverless function instance's
 * memory. On Vercel, concurrent traffic can be spread across multiple
 * instances that each keep their own independent counter, so this is a
 * per-instance throttle, not a globally-shared limit across the whole
 * deployment — sustained parallel abuse from many connections could exceed
 * MAX_REQUESTS_PER_WINDOW in aggregate. A true shared limit would need an
 * external store (e.g. Upstash Redis), which this project doesn't currently
 * have wired up. Still meaningfully throttles the common case (one script
 * hammering the endpoint, landing on the same warm instance).
 */
export function isRateLimited(request: Request, routeName: string): boolean {
  const key = getClientKey(request, routeName);
  const now = Date.now();
  const existing = requestCounts.get(key);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    if (requestCounts.size >= MAX_TRACKED_KEYS) pruneExpiredEntries(now);

    requestCounts.set(key, { count: 1, windowStart: now });

    return false;
  }

  existing.count += 1;

  return existing.count > MAX_REQUESTS_PER_WINDOW;
}
