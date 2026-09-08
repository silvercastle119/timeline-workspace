"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import type { Language } from "@/lib/i18n/language";

const OPTIONS: { value: Language; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];

export function LanguageSegmentedControl({
  className = "",
}: {
  className?: string;
}) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-md border border-zinc-300 p-0.5 text-xs font-medium ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = lang === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLang(option.value)}
            aria-pressed={active}
            className={`rounded-[5px] px-2 py-0.5 transition ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
