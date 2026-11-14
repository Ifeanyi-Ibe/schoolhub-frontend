// Naira formatting from integer kobo (1 NGN = 100 kobo). Integer maths only: no floats, so no
// rounding drift on large fees. Money is never displayed from a floating-point value.

const groupFormatter = new Intl.NumberFormat("en-NG", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/**
 * Format kobo as naira, for example 123450 → "₦1,234.50". Negative amounts keep a leading minus.
 * Throws on non-integer input: money must arrive as integer kobo (CLAUDE.md, API conventions).
 */
export function formatNaira(kobo: number | bigint): string {
  const value = typeof kobo === "bigint" ? kobo : toBigIntStrict(kobo);
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const major = abs / 100n;
  const minor = abs % 100n;
  return `${sign}₦${groupFormatter.format(major)}.${minor.toString().padStart(2, "0")}`;
}

function toBigIntStrict(kobo: number): bigint {
  if (!Number.isSafeInteger(kobo)) {
    throw new RangeError("Money must be an integer number of kobo");
  }
  return BigInt(kobo);
}
