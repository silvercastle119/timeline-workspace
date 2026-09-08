import { common } from "./common";
import { desktop } from "./desktop";
import { mobile } from "./mobile";

/**
 * English translations keyed by the Korean source string. Merged from the
 * per-surface files. In "ko" mode the source string is returned as-is, so there
 * is no Korean dictionary.
 */
export const en: Record<string, string> = {
  ...common,
  ...desktop,
  ...mobile,
};
