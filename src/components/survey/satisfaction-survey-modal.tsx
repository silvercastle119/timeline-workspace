"use client";

import { useEffect, useRef, useState } from "react";
import { submitSurveyResponse } from "@/lib/survey/submit-survey-response";
import { markSurveyDismissed, markSurveySubmitted } from "@/lib/survey/survey-visibility";

const MODAL_CLOSE_ANIMATION_MS = 180;
const OPINION_MAX_LENGTH = 500;

type RatingOption = { value: number; label: string };

const SATISFACTION_OPTIONS: readonly RatingOption[] = [
  { value: 1, label: "매우 불만족" },
  { value: 2, label: "불만족" },
  { value: 3, label: "보통" },
  { value: 4, label: "만족" },
  { value: 5, label: "매우 만족" },
];

const HELPFULNESS_OPTIONS: readonly RatingOption[] = [
  { value: 1, label: "전혀 도움 안 됨" },
  { value: 2, label: "별로 도움 안 됨" },
  { value: 3, label: "보통" },
  { value: 4, label: "도움이 됨" },
  { value: 5, label: "매우 도움이 됨" },
];

type SatisfactionSurveyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
};

export function SatisfactionSurveyModal({ isOpen, onClose, projectId }: SatisfactionSurveyModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [opinion, setOpinion] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "error">("idle");

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const requestClose = () => {
    if (submitStatus === "submitting") return;

    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      closeTimeoutRef.current = null;
      setSatisfaction(null);
      setHelpfulness(null);
      setOpinion("");
      setSubmitStatus("idle");
      onClose();
    }, MODAL_CLOSE_ANIMATION_MS);
  };

  // Closing without having submitted (X / 나중에 하기 / 배경 클릭 / Esc) — starts
  // the 10-hour re-show cooldown. A successful submit uses requestClose()
  // directly after markSurveySubmitted() instead, see handleSubmit().
  const handleDismiss = () => {
    if (submitStatus === "submitting") return;
    markSurveyDismissed();
    requestClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleDismiss();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = satisfaction !== null && helpfulness !== null;

  const handleSubmit = async () => {
    if (!canSubmit || submitStatus === "submitting") return;

    setSubmitStatus("submitting");

    const result = await submitSurveyResponse({
      satisfaction,
      helpfulness,
      opinion: opinion.trim(),
      projectId,
    });

    if (!result.ok) {
      setSubmitStatus("error");
      return;
    }

    console.log("[satisfaction-survey] submitted");
    markSurveySubmitted();
    requestClose();
  };

  return (
    <div
      onClick={handleDismiss}
      className={`fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 ${
        isClosing
          ? "animate-[guide-backdrop-out_180ms_ease-in_forwards]"
          : "animate-[guide-backdrop-in_180ms_ease-out]"
      }`}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl ${
          isClosing
            ? "animate-[guide-panel-out_180ms_ease-in_forwards]"
            : "animate-[guide-panel-in_220ms_ease-out]"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">만족도 조사</h2>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="만족도 조사 닫기"
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-90"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <RatingField
            label="전반적으로 얼마나 만족하시나요?"
            options={SATISFACTION_OPTIONS}
            value={satisfaction}
            onChange={setSatisfaction}
          />

          <RatingField
            label="업무에 얼마나 도움이 되었나요?"
            options={HELPFULNESS_OPTIONS}
            value={helpfulness}
            onChange={setHelpfulness}
          />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-700">
              개선 의견 <span className="text-zinc-400">(선택)</span>
            </span>
            <textarea
              value={opinion}
              onChange={(event) => setOpinion(event.target.value.slice(0, OPINION_MAX_LENGTH))}
              placeholder="더 나아졌으면 하는 점을 자유롭게 남겨주세요."
              rows={3}
              className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none"
            />
          </label>

          {submitStatus === "error" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              의견을 보내지 못했습니다. 잠시 후 다시 시도해주세요.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-5 py-4">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={submitStatus === "submitting"}
            className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            나중에 하기
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitStatus === "submitting"}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitStatus === "submitting" ? "보내는 중..." : "의견 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly RatingOption[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-xs font-medium text-zinc-700">{label}</legend>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-center transition ${
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  selected ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {option.value}
              </span>
              <span className="text-[10px] leading-tight">{option.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
