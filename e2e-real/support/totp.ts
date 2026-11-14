// TOTP codes for the platform developer account. The backend rejects a code that was already used,
// so each call returns the first step that has not been used yet, waiting for it if necessary.
import { generateSync } from "otplib";

const PERIOD_S = 30;
const lastUsedStep = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function freshTotp(secret: string): Promise<string> {
  const nowStep = Math.floor(Date.now() / 1000 / PERIOD_S);
  const last = lastUsedStep.get(secret) ?? -Infinity;
  const step = Math.max(nowStep, last + 1);
  // The code for a future step is only valid once that step has started (plus clock tolerance).
  const startsAtMs = step * PERIOD_S * 1000;
  if (startsAtMs > Date.now()) await sleep(startsAtMs - Date.now() + 200);
  lastUsedStep.set(secret, step);
  return generateSync({ secret, epoch: step * PERIOD_S });
}
