// Test double for the admin dashboard (ADR 0025, slice 4): one read for the term, with fixed figures for the test school.
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface DashboardCall {
  method: string;
  path: string;
  url: URL;
  res: ServerResponse;
  send: Send;
  label: string;
}

const problem = (status: number, code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
});

const CAN = new Set(["admin"]);

export function handleDashboard(call: DashboardCall): boolean {
  const { method, path, url, res, send, label } = call;
  if (path !== "/api/v1/dashboard/admin" || method !== "GET") return false;
  if (!CAN.has(label)) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
  const termId = url.searchParams.get("termId") ?? "";
  send(res, 200, {
    generatedAt: "2026-11-22T08:00:00.000Z",
    termId,
    enrolment: {
      active: 120,
      suspended: 2,
      withdrawn: 3,
      graduated: 5,
      transferred: 1,
      activeFemale: 61,
      activeMale: 59,
    },
    fees: {
      billedKobo: 90000000,
      collectedKobo: 61500000,
      outstandingKobo: 28500000,
      debtorCount: 17,
      collectedPercent: 68.3,
    },
    results: { sheetsTotal: 24, sheetsApproved: 18, armsPublished: 2 },
    notIncluded: ["statement", "virtual accounts"],
  });
  return true;
}
