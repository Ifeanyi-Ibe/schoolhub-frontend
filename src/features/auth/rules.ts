// Client-side form rules, built into React Hook Form (no schema library in the browser bundle, which
// keeps the first load within budget). The BFF validates the same fields strictly on the server
// (src/server/auth-schemas.ts), so these rules only make errors appear sooner.
import type { FieldPath, FieldValues, RegisterOptions } from "react-hook-form";

type Messages = { required: string; tooShort: string };
type Rules<T extends FieldValues, N extends FieldPath<T>> = RegisterOptions<T, N>;

export function requiredText<
  T extends FieldValues = FieldValues,
  N extends FieldPath<T> = FieldPath<T>,
>(message: string): Rules<T, N> {
  return {
    required: message,
    validate: (v: unknown) => (typeof v === "string" && v.trim().length > 0) || message,
  };
}

export function patternRule<
  T extends FieldValues = FieldValues,
  N extends FieldPath<T> = FieldPath<T>,
>(pattern: RegExp, message: string): Rules<T, N> {
  return { pattern: { value: pattern, message } };
}

export function passwordRules<
  T extends FieldValues = FieldValues,
  N extends FieldPath<T> = FieldPath<T>,
>(messages: Messages): Rules<T, N> {
  return {
    required: messages.required,
    minLength: { value: 10, message: messages.tooShort },
    maxLength: { value: 256, message: messages.tooShort },
  };
}

export const PATTERNS = {
  phone: /^\+?[0-9 ()-]{7,20}$/,
  otp: /^\d{6}$/,
  code: /^[A-Za-z0-9-]{6,32}$/,
};

/** Required, plus an optional pattern, as one rule object (keeps strict optional typing happy). */
export function fieldRules<
  T extends FieldValues = FieldValues,
  N extends FieldPath<T> = FieldPath<T>,
>(message: string, pattern?: RegExp): Rules<T, N> {
  const rules: Rules<T, N> = requiredText<T, N>(message);
  if (pattern) rules.pattern = { value: pattern, message };
  return rules;
}
