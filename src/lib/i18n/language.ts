export type Language = "ko" | "en";

export const DEFAULT_LANGUAGE: Language = "ko";

export const LANGUAGE_STORAGE_KEY = "todoline:language";

export function isLanguage(value: unknown): value is Language {
  return value === "ko" || value === "en";
}

/** Reads the stored UI language. SSR-safe — returns the default when unavailable. */
export function readStoredLanguage(): Language {
  try {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE;

    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch (error) {
    console.warn("[i18n] failed to read stored language:", error);
    return DEFAULT_LANGUAGE;
  }
}

/** Persists the UI language. Silently ignores storage failures (private mode, etc.). */
export function writeStoredLanguage(language: Language): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.warn("[i18n] failed to persist language:", error);
  }
}
