export const DEFAULT_BAR_COLOR = "#71717a";

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Soft pastel work-item palette — Red → Peach → Yellow → Green → Teal →
// Blue → Indigo → Purple → Pink, in the TO-DO-LINE brand's restrained,
// friendly tone (never saturated/loud). These hex values are shared
// verbatim with Excel export — Excel never re-lightens/darkens/
// desaturates them, so a color picked here looks identical on both
// surfaces.
export const DEFAULT_COLOR_PALETTE: string[] = [
  "#F2A0A0",
  "#F3BE8C",
  "#EFD48A",
  "#C3DE9A",
  "#9CD3AA",
  "#93D0C7",
  "#93CFE0",
  "#93B8EA",
  "#A6ACE8",
  "#C3A8E0",
  "#E3A8CB",
  "#F5A9C0",
];

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  return [r, g, b];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toByte = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");

  // Uppercase to match every other hex producer in this module/app
  // (DEFAULT_COLOR_PALETTE, colorToExcelArgb, argbToHex in excel-import.ts)
  // — excel-import.ts's G' fallback (a 1-day item that's also its own
  // checkpoint) reverse-derives the base color via lightenColor(), and that
  // value gets stored as item.color and compared with `===` against the
  // palette (see the customColors dedup in excel-import.ts and the aside
  // panel's swatch-selection check) — a lowercase/uppercase mismatch there
  // silently defeated both.
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`.toUpperCase();
}

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number) {
  return c <= 0.0031308
    ? 12.92 * c
    : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

type OkLch = { l: number; c: number; h: number };

function rgbToOklch([r, g, b]: [number, number, number]): OkLch {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bOk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const c = Math.sqrt(a * a + bOk * bOk);
  const h = Math.atan2(bOk, a);

  return { l: L, c, h };
}

function oklchToRgb({ l, c, h }: OkLch): [number, number, number] {
  const a = c * Math.cos(h);
  const bOk = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bOk;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bOk;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * bOk;

  const lCubed = l_ * l_ * l_;
  const mCubed = m_ * m_ * m_;
  const sCubed = s_ * s_ * s_;

  const lr =
    4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const lg =
    -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const lb =
    -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.7076147010 * sCubed;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

export function blendColors(colors: string[]): string {
  const validColors = colors.filter(Boolean);

  if (validColors.length === 0) return DEFAULT_BAR_COLOR;
  if (validColors.length === 1) return validColors[0];

  const points = validColors.map((color) => rgbToOklch(hexToRgb(color)));

  const l =
    points.reduce((sum, point) => sum + point.l, 0) / points.length;
  const c =
    points.reduce((sum, point) => sum + point.c, 0) / points.length;

  const sinSum = points.reduce(
    (sum, point) => sum + Math.sin(point.h) * point.c,
    0
  );
  const cosSum = points.reduce(
    (sum, point) => sum + Math.cos(point.h) * point.c,
    0
  );
  const h = sinSum === 0 && cosSum === 0 ? 0 : Math.atan2(sinSum, cosSum);

  return rgbToHex(oklchToRgb({ l, c, h }));
}

// Darkens a hex color by reducing OKLCH lightness — used to derive a
// checkpoint marker's fill/border from its parent Work Item's color, so no
// new fixed palette is introduced (see color-utils.ts module doc above).
export function darkenColor(hex: string, amount: number): string {
  const safeHex = HEX_COLOR_PATTERN.test(hex) ? hex : DEFAULT_BAR_COLOR;
  const oklch = rgbToOklch(hexToRgb(safeHex));

  return rgbToHex(oklchToRgb({ ...oklch, l: Math.max(0, oklch.l - amount) }));
}

// Inverse of darkenColor — used by Excel import to recover a Work Item's
// base color from a checkpoint cell's (already-darkened) fill when a row
// has no other, non-checkpoint-styled cell to sample the base color from
// (e.g. a 1-day item whose only day is also its checkpoint).
export function lightenColor(hex: string, amount: number): string {
  const safeHex = HEX_COLOR_PATTERN.test(hex) ? hex : DEFAULT_BAR_COLOR;
  const oklch = rgbToOklch(hexToRgb(safeHex));

  return rgbToHex(oklchToRgb({ ...oklch, l: Math.min(1, oklch.l + amount) }));
}

// Minimum OKLCH lightness drop for `candidateHex` to count as a "darker
// variant" of `baseHex` — well below the fixed 0.22 that darkenColor uses
// at export time, so float/rounding drift never causes a false negative,
// but high enough to reject two colors that are basically the same.
const MIN_DARKER_LIGHTNESS_DROP = 0.08;
// Below this OKLCH chroma a color is close enough to gray that its hue
// angle is numerically unstable, so hue comparison is skipped and only
// the lightness drop is used.
const MIN_CHROMA_FOR_HUE_CHECK = 0.02;
// Max OKLCH hue difference (radians) to still count as "the same color
// family" — generous enough to tolerate rendering-related drift while
// still rejecting an unrelated color.
const MAX_HUE_DIFF_RADIANS = Math.PI / 4;

// Used by Excel import to tell a checkpoint cell (darker variant of its
// row's base color) apart from a cell a user simply bolded/recolored by
// hand — see the Excel Import redesign plan's checkpoint-detection algorithm.
export function isDarkerVariant(candidateHex: string, baseHex: string): boolean {
  if (!HEX_COLOR_PATTERN.test(candidateHex) || !HEX_COLOR_PATTERN.test(baseHex)) {
    return false;
  }

  const candidate = rgbToOklch(hexToRgb(candidateHex));
  const base = rgbToOklch(hexToRgb(baseHex));

  if (base.l - candidate.l < MIN_DARKER_LIGHTNESS_DROP) return false;
  if (base.c < MIN_CHROMA_FOR_HUE_CHECK || candidate.c < MIN_CHROMA_FOR_HUE_CHECK) {
    return true;
  }

  let hueDiff = Math.abs(base.h - candidate.h);
  if (hueDiff > Math.PI) hueDiff = 2 * Math.PI - hueDiff;

  return hueDiff <= MAX_HUE_DIFF_RADIANS;
}

export function colorToExcelArgb(hex: string): string {
  const safeHex = HEX_COLOR_PATTERN.test(hex) ? hex : DEFAULT_BAR_COLOR;

  return `FF${safeHex.replace("#", "").toUpperCase()}`;
}
