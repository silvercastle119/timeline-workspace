import type { Project } from "@/types/project";
import { REVIEW_SEVERITIES, type ReviewSeverity } from "@/lib/ai/schemas";

export type ValidatedReviewIssue = {
  severity: ReviewSeverity;
  workItemId: string | null;
  itemName: string | null;
  title: string;
  description: string;
};

/**
 * Read-only feature: nothing here ever mutates project state, so there is no
 * undo/redo concern. Validation only exists to keep the rendered list honest
 * (no fabricated ids, no runaway severity labels).
 */
export function validateReviewIssues(project: Project, rawResponse: unknown): ValidatedReviewIssue[] {
  const rawIssues = extractIssues(rawResponse);
  const itemsById = new Map(project.workItems.map((item) => [item.id, item]));

  const issues: ValidatedReviewIssue[] = [];

  for (const raw of rawIssues) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const description = typeof raw.description === "string" ? raw.description.trim() : "";

    if (!title || !description) continue;

    const rawWorkItemId = typeof raw.workItemId === "string" ? raw.workItemId : "";
    const item = rawWorkItemId ? itemsById.get(rawWorkItemId) : undefined;
    const workItemId = item ? rawWorkItemId : null;

    const severity = isReviewSeverity(raw.severity) ? raw.severity : "참고";

    issues.push({
      severity,
      workItemId,
      itemName: item?.name ?? null,
      title,
      description,
    });
  }

  return issues;
}

function isReviewSeverity(value: unknown): value is ReviewSeverity {
  return typeof value === "string" && (REVIEW_SEVERITIES as readonly string[]).includes(value);
}

type RawIssue = { severity: unknown; workItemId: unknown; title: unknown; description: unknown };

function extractIssues(rawResponse: unknown): RawIssue[] {
  if (typeof rawResponse !== "object" || rawResponse === null) return [];

  const issues = (rawResponse as Record<string, unknown>).issues;

  if (!Array.isArray(issues)) return [];

  return issues.filter((item): item is RawIssue => typeof item === "object" && item !== null);
}
