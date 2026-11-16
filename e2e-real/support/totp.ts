// TOTP codes for the platform developer account. The backend refuses a code whose time step was already
// used, including by an earlier run, so the last used step is kept in a temp file (the step number only,
// never the secret). Each call uses the current step, or the next one if the current step is already used,
// waiting until that step has started. A code is never taken from a step that has not begun.
import { generateSync } from "otplib";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PERIOD_S = 30;
const STATE_FILE = join(tmpdir(), "schoolhub-e2e-totp-last-step");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lastStep(): number {
  try {
    const n = Number(readFileSync(STATE_FILE, "utf8").trim());
    return Number.isFinite(n) ? n : -Infinity;
  } catch {
    return -Infinity;
  }
}

export async function freshTotp(secret: string): Promise<string> {
  const nowStep = Math.floor(Date.now() / 1000 / PERIOD_S);
  const used = lastStep();
  const step = used >= nowStep ? used + 1 : nowStep;
  // The code for a step is valid only once that step has started (plus a little clock tolerance).
  const startsAtMs = step * PERIOD_S * 1000;
  if (startsAtMs > Date.now()) await sleep(startsAtMs - Date.now() + 200);
  writeFileSync(STATE_FILE, String(step));
  return generateSync({ secret, epoch: step * PERIOD_S });
}
