"use client";

import { useCallback } from "react";
import { useLanguage } from "./language-context";
import { en } from "./dictionary";
import type { Language } from "./language";

export type TranslateVars = Record<string, string | number>;

export type TranslateFn = (ko: string, vars?: TranslateVars) => string;

const warnedMissingKeys = new Set<string>();

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Resolves a Korean source string to the active language. */
export function translate(
  lang: Language,
  ko: string,
  vars?: TranslateVars,
): string {
  if (lang === "ko") return interpolate(ko, vars);

  const entry = en[ko];
  if (entry === undefined) {
    if (
      process.env.NODE_ENV !== "production" &&
      !warnedMissingKeys.has(ko)
    ) {
      warnedMissingKeys.add(ko);
      console.warn(`[i18n] missing English translation for: ${JSON.stringify(ko)}`);
    }
    return interpolate(ko, vars);
  }

  return interpolate(entry, vars);
}

/**
 * Returns `t(ko, vars?)` bound to the active language. `ko` is the Korean source
 * string (also the dictionary key); `{name}` placeholders are interpolated from
 * `vars` in both languages.
 */
export function useT(): TranslateFn {
  const { lang } = useLanguage();
  return useCallback((ko: string, vars?: TranslateVars) => translate(lang, ko, vars), [lang]);
}
