export const DEFAULT_BAR_COLOR = "#71717a";

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Coral → Apricot → Mustard → Lime → Green → Teal → Cyan → Blue → Indigo
// → Purple → Rose → Pink. These hex values are shared verbatim with Excel
// export — Excel never re-lightens/darkens/desaturates them, so a color
// picked here looks identical on both surfaces.
export const DEFAULT_COLOR_PALETTE: string[] = [
  "#E8757A",
  "#E99B68",
  "#D9B957",
  "#A5C968",
  "#5DBB7D",
  "#50B7AE",
  "#59B5CA",
  "#5C8FDC",
  "#777BD0",
  "#9D73C8",
  "#CA739F",
  "#D889A8",
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

  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
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

export function colorToExcelArgb(hex: string): string {
  const safeHex = HEX_COLOR_PATTERN.test(hex) ? hex : DEFAULT_BAR_COLOR;

  return `FF${safeHex.replace("#", "").toUpperCase()}`;
}
