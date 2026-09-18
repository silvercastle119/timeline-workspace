"use client";

import { useT } from "@/lib/i18n/use-t";

const GRANULARITY_VALUES = [1, 2, 3, 4, 5] as const;
export type GranularityLevel = (typeof GRANULARITY_VALUES)[number];

const GRANULARITY_LABELS: Record<GranularityLevel, string> = {
  1: "큰 단위의 업무 중심",
  2: "주요 업무 중심",
  3: "일반적인 업무 단위",
  4: "실행 단위까지 세부적으로 분류",
  5: "최대한 세부적으로 분류",
};

export function GranularitySelector({
  value,
  onChange,
}: {
  value: GranularityLevel;
  onChange: (value: GranularityLevel) => void;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span>{t("대략적으로")}</span>
        <span>{t("세부적으로")}</span>
      </div>

      <div
        role="group"
        aria-label={t("업무를 얼마나 세부적으로 나눌까요?")}
        className="flex items-center rounded-md border border-zinc-300 p-0.5 text-xs font-medium"
      >
        {GRANULARITY_VALUES.map((level) => {
          const active = value === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              aria-pressed={active}
              className={`flex-1 rounded-[5px] px-2 py-1 text-center transition ${
                active ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {level}
            </button>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        {value} · {t(GRANULARITY_LABELS[value])}
      </p>
    </div>
  );
}
