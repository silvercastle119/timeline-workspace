"use client";

import { useState, useSyncExternalStore } from "react";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function subscribeToMobileViewport(callback: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getIsMobileViewport() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getIsMobileViewportServerSnapshot() {
  return false;
}

/**
 * Dismissable notice shown while the viewport is mobile-sized, since the app
 * has no mobile-optimized layout yet. Reacts live to resize (matchMedia via
 * useSyncExternalStore — the same viewport hook React's own docs recommend
 * for this exact case, so the server-rendered markup never mismatches the
 * client's first paint). Dismissing only hides it for this page load — it
 * reappears on the next visit/reload while still on a narrow screen.
 */
export function MobileOptimizedNotice() {
  const isMobile = useSyncExternalStore(
    subscribeToMobileViewport,
    getIsMobileViewport,
    getIsMobileViewportServerSnapshot
  );
  const [dismissed, setDismissed] = useState(false);

  if (!isMobile || dismissed) return null;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">
            데스크탑에 최적화된 화면이에요
          </h2>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="안내 닫기"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-90"
          >
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          TO-DO-LINE은 아직 모바일 화면을 지원하지 않아요. 태블릿이나 노트북에서
          이용해주시면 더 편하게 쓰실 수 있습니다.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
