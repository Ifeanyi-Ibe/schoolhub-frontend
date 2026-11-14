import { clsx, type ClassValue } from "clsx";

/**
 * Join class names. Deliberately not tailwind-merge: it costs about 9 KB on every first load, and
 * components here never rely on a later class overriding an earlier conflicting one. Where a
 * conflict can occur (input border colour), the class is chosen explicitly instead.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
