// Tenant brand colours as CSS, rendered in a nonce'd <style> element rather than as inline style
// attributes (which style-src-attr would have to allow). The school's colour is accepted only as
// #RRGGBB. Anything else is rejected and the default theme applies, so no part of the value can reach
// the stylesheet except six hexadecimal digits.

import { guardBrandColor } from "./contrast";

const STRICT_HEX = /^#[0-9a-fA-F]{6}$/;

/** A brand colour that may be used at all: exactly #RRGGBB. Anything else returns null. */
export function validBrandHex(input: unknown): string | null {
  return typeof input === "string" && STRICT_HEX.test(input) ? input : null;
}

/**
 * The stylesheet that applies a school's colours to `.tenant-brand`, or null for the default theme.
 * The accent passes the WCAG AA guard first, so the stylesheet only ever holds guarded #RRGGBB values.
 */
export function brandStyleSheet(primaryColor: unknown): string | null {
  const valid = validBrandHex(primaryColor);
  if (valid === null) return null;
  const guard = guardBrandColor(valid, { textOn: "white" });
  return `.tenant-brand{--brand:${guard.accent};--on-brand:${guard.onAccent}}`;
}
