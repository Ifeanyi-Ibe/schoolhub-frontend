// Class levels and their arms (CRUD). Typed by the generated client; reads need academics.read and writes
// need academics.manage (FEATURE_SPEC). No idempotency or If-Match is declared for these operations, so
// none is sent (writePolicyHeaders keeps it that way).
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { ClassSection } from "./rules";

export const levelsQuery = {
  queryKey: ["class-levels"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/class-levels")),
};

export function armsQuery(levelId: string) {
  return {
    queryKey: ["class-level-arms", levelId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/class-levels/{id}/arms", {
          params: { path: { id: levelId } },
        }),
      ),
  };
}

export interface LevelInput {
  code: string;
  name: string;
  order: number;
  section: ClassSection;
}

export async function createLevel(input: LevelInput) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/class-levels" });
  return unwrap(
    await apiClient.POST("/api/v1/class-levels", { body: input, headers: policy.headers }),
  );
}

export async function updateLevel(id: string, input: LevelInput) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/class-levels/{id}" });
  return unwrap(
    await apiClient.PUT("/api/v1/class-levels/{id}", {
      params: { path: { id } },
      body: input,
      headers: policy.headers,
    }),
  );
}

export interface ArmInput {
  name: string;
  capacity: number;
  formTeacherStaffId: string | null;
}

export async function createArm(levelId: string, input: ArmInput) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/class-levels/{id}/arms" });
  return unwrap(
    await apiClient.POST("/api/v1/class-levels/{id}/arms", {
      params: { path: { id: levelId } },
      body: input,
      headers: policy.headers,
    }),
  );
}
