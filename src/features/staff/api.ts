// Typed reads and writes for the people and roles screens. Every call goes through the single error
// boundary (unwrap), and every write sends only the headers the contract declares for it
// (writePolicyHeaders). Types come from the generated client; nothing here is hand-written.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import { PEOPLE_PAGE_SIZE, type PeopleQuery } from "./rules";

export const permissionCatalogQuery = {
  queryKey: ["permissions"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/permissions")),
};

export const rolesQuery = {
  queryKey: ["roles"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/roles")),
};

export function peopleQuery(state: PeopleQuery) {
  return {
    queryKey: ["users", state.q, state.page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/users", {
          params: {
            query: {
              ...(state.q !== "" ? { q: state.q } : {}),
              page: state.page,
              pageSize: PEOPLE_PAGE_SIZE,
            },
          },
        }),
      ),
  };
}

export interface InviteInput {
  displayName: string;
  email: string | null;
  phone: string | null;
  roleIds: string[] | null;
}

/** Invites a staff user. The Idempotency-Key is created once per action and reused on retries. */
export async function inviteUser(input: InviteInput, idempotencyKey: string) {
  const policy = writePolicyHeaders({
    method: "POST",
    path: "/api/v1/users/invite",
    idempotencyKey,
  });
  const key = policy.headers["Idempotency-Key"];
  // The contract declares the header on this operation, so the policy always sends it.
  if (key === undefined) throw new Error("Idempotency-Key is declared for this operation");
  return unwrap(
    await apiClient.POST("/api/v1/users/invite", {
      params: { header: { "Idempotency-Key": key } },
      body: input,
    }),
  );
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: string[];
}

/** Creates a custom role (plan-gated). The contract does not declare an idempotency key here. */
export async function createRole(input: RoleInput) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/roles" });
  return unwrap(await apiClient.POST("/api/v1/roles", { body: input, headers: policy.headers }));
}

/** Replaces a role's permissions. No idempotency or If-Match is declared for this operation (B-05). */
export async function setRolePermissions(roleId: string, permissions: string[]) {
  const policy = writePolicyHeaders({
    method: "PUT",
    path: "/api/v1/roles/{id}/permissions",
  });
  return unwrap(
    await apiClient.PUT("/api/v1/roles/{id}/permissions", {
      params: { path: { id: roleId } },
      body: { permissions },
      headers: policy.headers,
    }),
  );
}
