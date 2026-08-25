"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { submitFeedbackReport, type FeedbackType } from "@/lib/feedback/submit-feedback-report";

const MODAL_CLOSE_ANIMATION_MS = 180;
const SUCCESS_DISPLAY_MS = 1400;
const CONTENT_MAX_LENGTH = 1000;

const FEEDBACK_TYPE_OPTIONS: readonly FeedbackType[] = ["오류 신고", "개선 제안", "기타 의견"];

type SubmitStatus = "idle" | "submitting" | "success" | "error";

type FeedbackReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
};

export function FeedbackReportModal({ isOpen, onClose, projectId }: FeedbackReportModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [content, setContent] = useState("");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  const requestClose = () => {
    if (submitStatus === "submitting") return;

    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }

    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      closeTimeoutRef.current = null;
      setFeedbackType(null);
      setContent("");
      setSubmitStatus("idle");
      onClose();
    }, MODAL_CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = feedbackType !== null && content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitStatus === "submitting") return;

    setSubmitStatus("submitting");

    const result = await submitFeedbackReport({
      feedbackType,
      content: content.trim(),
      projectId,
      pagePath: window.location.pathname,
      userAgent: navigator.userAgent,
    });

    if (!result.ok) {
      setSubmitStatus("error");
      return;
    }

    trackEvent({ eventType: "feedback_submit", projectId });
    setSubmitStatus("success");
    successTimeoutRef.current = setTimeout(() => {
      successTimeoutRef.current = null;
      requestClose();
    }, SUCCESS_DISPLAY_MS);
  };

  return (
    <div
      onClick={requestClose}
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
          <h2 className="text-base font-semibold text-zinc-900">오류 신고 · 개선 제안</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="피드백 닫기"
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-90"
          >
            ✕
          </button>
        </div>

        {submitStatus === "success" ? (
          <div className="flex flex-col items-center gap-1 px-5 py-12 text-center">
            <p className="text-sm font-medium text-zinc-900">
              소중한 의견을 보내주셔서 감사합니다.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5 px-5 py-5">
              <FeedbackTypeField value={feedbackType} onChange={setFeedbackType} />

              <label className="block">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-700">내용</span>
                  <span className="text-xs text-zinc-400">
                    {content.length} / {CONTENT_MAX_LENGTH}
                  </span>
                </div>
                <textarea
                  value={content}
                  onChange={(event) =>
                    setContent(event.target.value.slice(0, CONTENT_MAX_LENGTH))
                  }
                  placeholder="불편했던 점이나 개선되었으면 하는 점을 자유롭게 적어주세요."
                  rows={5}
                  className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none"
                />
              </label>

              {submitStatus === "error" && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  전송에 실패했습니다. 잠시 후 다시 시도해주세요.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-5 py-4">
              <button
                type="button"
                onClick={requestClose}
                disabled={submitStatus === "submitting"}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitStatus === "submitting"}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitStatus === "submitting" ? "제출 중..." : "제출하기"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FeedbackTypeField({
  value,
  onChange,
}: {
  value: FeedbackType | null;
  onChange: (value: FeedbackType) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-xs font-medium text-zinc-700">유형</legend>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="피드백 유형">
        {FEEDBACK_TYPE_OPTIONS.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={`rounded-md border px-2 py-2 text-center text-sm font-medium transition ${
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
