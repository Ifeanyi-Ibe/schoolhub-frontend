// WCAG 2.2 contrast helpers and the tenant brand guard.
//
// Tenant colours come from the school's settings and are applied at runtime, so they are never
// trusted as-is. guardBrandColor() returns an accent that meets WCAG AA (4.5:1 for text) against
// the best of white or black text, adjusting lightness (keeping hue) when needed.

export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

export type Rgb = readonly [number, number, number];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(input: string): Rgb | null {
  const m = HEX.exec(input.trim());
  if (!m || m[1] === undefined) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** Which text colour reads better on this background. */
export function bestTextOn(bg: Rgb): { text: Rgb; ratio: number } {
  const onWhite = contrastRatio(bg, WHITE);
  const onBlack = contrastRatio(bg, BLACK);
  return onWhite >= onBlack ? { text: WHITE, ratio: onWhite } : { text: BLACK, ratio: onBlack };
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

export interface BrandGuard {
  /** The accent to use, possibly adjusted from the school's colour. */
  accent: string;
  /** The text colour to place on the accent. Always the requested one (white by default). */
  onAccent: string;
  /** Contrast ratio of onAccent on accent. At least AA_TEXT. */
  ratio: number;
  /** True when the school's colour had to be adjusted. */
  adjusted: boolean;
}

export interface BrandGuardOptions {
  /** Platform accent used when the school's value is not a valid hex colour. */
  fallback?: string;
  /** Text colour that must stay readable on the accent. White matches the default --on-brand. */
  textOn?: "white" | "black";
}

/**
 * Make a school colour safe for text on it. The text colour is fixed (white by default, matching
 * --on-brand), so a colour that fails AA is darkened (or lightened, for black text) in small steps,
 * keeping its hue and saturation, until it passes. Invalid input falls back to the platform accent.
 */
export function guardBrandColor(input: string, options: BrandGuardOptions = {}): BrandGuard {
  const fallback = options.fallback ?? "#0f5c4d";
  const text: Rgb = options.textOn === "black" ? BLACK : WHITE;
  const parsed = parseHex(input);
  const original = parsed ?? parseHex(fallback);
  if (original === null) throw new Error("Fallback brand colour is invalid");

  let rgb: Rgb = original;
  let adjusted = parsed === null;
  let ratio = contrastRatio(rgb, text);
  if (ratio < AA_TEXT) {
    const [h, s, l0] = rgbToHsl(rgb);
    const towardDark = text === WHITE;
    let l = l0;
    for (let step = 0; ratio < AA_TEXT && step < 100; step++) {
      l = towardDark ? Math.max(0, l - 0.01) : Math.min(1, l + 0.01);
      rgb = hslToRgb([h, s, l]).map((v) => Math.round(v)) as unknown as Rgb;
      ratio = contrastRatio(rgb, text);
      adjusted = true;
    }
  }
  return {
    accent: toHex(rgb),
    onAccent: toHex(text),
    ratio: Math.round(ratio * 100) / 100,
    adjusted,
  };
}
