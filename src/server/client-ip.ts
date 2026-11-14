import { isIP } from "node:net";

/**
 * The real client IP, read from X-Forwarded-For.
 *
 * Only the entries appended by our own reverse proxy are trusted. With `trustedHops` proxies in
 * front of the BFF, the client IP is the entry that the outermost trusted proxy saw, which sits
 * `trustedHops` positions from the right. Anything to the left of it is client-controlled and is
 * ignored. With `trustedHops = 0` no proxy is trusted and no client IP is forwarded.
 */
export function clientIpFromForwardedFor(
  forwardedFor: string | null | undefined,
  trustedHops: number,
): string | null {
  if (trustedHops < 1 || !forwardedFor) return null;
  const parts = forwardedFor
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const index = parts.length - trustedHops;
  if (index < 0) return null;
  const candidate = parts[index];
  return candidate !== undefined && isIP(candidate) !== 0 ? candidate : null;
}
