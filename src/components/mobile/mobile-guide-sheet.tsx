"use client";

import { useState } from "react";
import {
  getMobileGuideFaqItems,
  getMobileGuideFullSteps,
  getMobileGuideSummarySteps,
  getMobileGuideTabs,
  GuideFaqSection,
} from "@/components/mobile/mobile-guide-content";
import { useLanguage } from "@/lib/i18n/language-context";
import { useT } from "@/lib/i18n/use-t";

type MobileGuideSheetProps = {
  onClose: () => void;
};

export function MobileGuideSheet({ onClose }: MobileGuideSheetProps) {
  const { lang } = useLanguage();
  const t = useT();
  const tabs = getMobileGuideTabs(lang);
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85dvh] w-[calc(100%-32px)] max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">{t("사용법")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("닫기")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            ✕
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 px-3 pt-2">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(index)}
              className={`shrink-0 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium ${
                activeTab === index
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-zinc-500"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {activeTab === 0 && (
            <div className="space-y-6">
              {getMobileGuideFullSteps(lang).map((step) => (
                <div key={step.number}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600">{step.number}</span>
                    <h3 className="text-sm font-semibold text-zinc-900">{step.title}</h3>
                  </div>
                  <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-700">
                    {step.body}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 1 && (
            <div className="space-y-4">
              {getMobileGuideSummarySteps(lang).map((step) => (
                <div key={step.number} className="flex gap-2 text-sm">
                  <span className="shrink-0 font-semibold text-blue-600">{step.number}</span>
                  <div>
                    <span className="font-semibold text-zinc-900">{step.title}</span>
                    <div className="mt-0.5 text-zinc-600">{step.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 2 && (
            <GuideFaqSection items={getMobileGuideFaqItems(lang)} />
          )}
        </div>
      </div>
    </div>
  );
}
