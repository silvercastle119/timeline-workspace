import type { Project } from "@/types/project";
import {
  WORK_STRUCTURE_MAX_DEPTH,
  WORK_STRUCTURE_MAX_TOTAL_NODES,
} from "@/lib/ai/schemas";

export type WorkStructurePreviewNode = {
  tempId: string;
  name: string;
  duplicateWarning: boolean;
  children: WorkStructurePreviewNode[];
};

export type RequiredTaskCoverageResult = {
  requiredTask: string;
  covered: boolean;
};

export type ValidatedWorkStructure = {
  items: WorkStructurePreviewNode[];
  notes: string[];
  requiredTaskCoverage: RequiredTaskCoverageResult[];
};

const MAX_NAME_LENGTH = 100;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function extractNotes(rawResponse: unknown): string[] {
  if (typeof rawResponse !== "object" || rawResponse === null) return [];

  const notes = (rawResponse as Record<string, unknown>).notes;

  if (!Array.isArray(notes)) return [];

  return notes.filter((note): note is string => typeof note === "string");
}

function collectNormalizedNames(nodes: WorkStructurePreviewNode[]): Set<string> {
  const names = new Set<string>();

  const walk = (list: WorkStructurePreviewNode[]) => {
    for (const node of list) {
      names.add(normalizeName(node.name));
      walk(node.children);
    }
  };

  walk(nodes);

  return names;
}

/**
 * AI's own requiredTask -> representedAsNodeName claims, as a map keyed by
 * normalized requiredTask string. Never used on its own — the caller must
 * still confirm the claimed node actually exists in the final tree.
 */
function extractCoverageClaims(rawResponse: unknown): Map<string, string> {
  const claims = new Map<string, string>();

  if (typeof rawResponse !== "object" || rawResponse === null) return claims;

  const rawCoverage = (rawResponse as Record<string, unknown>).requiredTaskCoverage;

  if (!Array.isArray(rawCoverage)) return claims;

  for (const raw of rawCoverage) {
    if (typeof raw !== "object" || raw === null) continue;

    const entry = raw as Record<string, unknown>;

    if (typeof entry.requiredTask !== "string" || typeof entry.representedAsNodeName !== "string") {
      continue;
    }

    claims.set(normalizeName(entry.requiredTask), entry.representedAsNodeName);
  }

  return claims;
}

/**
 * "필수 과업 보존" check. Never trusts the AI's requiredTaskCoverage claims
 * on their own (principle 1): a claimed representedAsNodeName only counts if
 * that exact node actually survived into the final (post-hardcap) tree
 * (principle 2) — this also automatically treats a hallucinated node name,
 * or one that got truncated by the depth/count hardcaps, as uncovered. If no
 * claim was made (or it didn't check out), a last-resort exact-string
 * fallback catches the common case where the required task's own wording was
 * kept verbatim as some node's name (principle 3). Either way, the result is
 * advisory only — the caller must never let this block applying the
 * structure (principle 4) and must always render the full tree for the user
 * to confirm regardless of coverage (principle 5).
 */
function computeRequiredTaskCoverage(
  requiredTasks: string[],
  items: WorkStructurePreviewNode[],
  rawResponse: unknown
): RequiredTaskCoverageResult[] {
  const presentNames = collectNormalizedNames(items);
  const claims = extractCoverageClaims(rawResponse);

  return requiredTasks.map((task) => {
    const normalizedTask = normalizeName(task);
    const claim = claims.get(normalizedTask);

    if (claim && presentNames.has(normalizeName(claim))) {
      return { requiredTask: task, covered: true };
    }

    if (presentNames.has(normalizedTask)) {
      return { requiredTask: task, covered: true };
    }

    return { requiredTask: task, covered: false };
  });
}

/**
 * Never trusts the raw Gemini response. A structurally broken top level
 * (not an object, `items` not an array) returns null so the caller shows an
 * error instead of a broken preview. Anything recoverable at the node level
 * (missing name, over depth, over the total-node budget) is dropped/truncated
 * node-by-node instead of failing the whole response — same "flag, don't
 * silently trust" philosophy as validate-schedule-suggestions.ts, adapted to
 * a nested tree instead of a flat suggestion list.
 */
export function validateWorkStructureResponse(
  project: Project,
  requiredTasks: string[],
  rawResponse: unknown
): ValidatedWorkStructure | null {
  if (typeof rawResponse !== "object" || rawResponse === null) return null;

  const rawItems = (rawResponse as Record<string, unknown>).items;

  if (!Array.isArray(rawItems)) return null;

  const existingNames = new Set(
    project.workItems.map((item) => normalizeName(item.name))
  );

  let remainingBudget = WORK_STRUCTURE_MAX_TOTAL_NODES;

  const buildNode = (raw: unknown, depth: number): WorkStructurePreviewNode | null => {
    if (remainingBudget <= 0) return null;
    if (typeof raw !== "object" || raw === null) return null;

    const record = raw as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";

    if (!name) return null;

    remainingBudget -= 1;

    const rawChildren = Array.isArray(record.children) ? record.children : [];
    const children =
      depth >= WORK_STRUCTURE_MAX_DEPTH
        ? []
        : rawChildren
            .map((child) => buildNode(child, depth + 1))
            .filter((child): child is WorkStructurePreviewNode => child !== null);

    return {
      tempId: crypto.randomUUID(),
      name: name.slice(0, MAX_NAME_LENGTH),
      duplicateWarning: existingNames.has(normalizeName(name)),
      children,
    };
  };

  const items = rawItems
    .map((raw) => buildNode(raw, 1))
    .filter((node): node is WorkStructurePreviewNode => node !== null);

  return {
    items,
    notes: extractNotes(rawResponse),
    requiredTaskCoverage: computeRequiredTaskCoverage(requiredTasks, items, rawResponse),
  };
}
