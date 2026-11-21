// Staff records, assignments, leave and invitations. Typed by the generated client from docs/openapi/v1.json.
// The contract declares no Idempotency-Key and no If-Match on any staff operation, so none is sent; the screens
// guard double submits while a request is pending (see docs/BACKEND_GAPS.md B-34 and B-35).
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { AssignmentInput, StaffRequest, STAFF_STATUSES, STAFF_TYPES } from "./rules";

export type StaffView = components["schemas"]["StaffView"];
export type StaffListItem = components["schemas"]["StaffListItem"];
export type AssignmentView = components["schemas"]["AssignmentView"];
export type LeaveView = components["schemas"]["LeaveView"];
export type LeaveRequestBody = components["schemas"]["LeaveRequestBody"];
export type ArmTeacherView = components["schemas"]["ArmTeacherView"];
export type MyAssignmentsView = components["schemas"]["MyAssignmentsView"];
export type InvitedAccount = components["schemas"]["InvitedAccount"];
export type InviteStaffAccountRequest = components["schemas"]["InviteStaffAccountRequest"];

export interface StaffListParams {
  q: string;
  staffType: string;
  status: string;
  page: number;
}

export function staffListQuery(params: StaffListParams) {
  return {
    queryKey: ["staff-list", params.q, params.staffType, params.status, params.page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/staff", {
          params: {
            query: {
              ...(params.q !== "" ? { q: params.q } : {}),
              ...(params.staffType !== ""
                ? { staffType: params.staffType as (typeof STAFF_TYPES)[number] }
                : {}),
              ...(params.status !== ""
                ? { status: params.status as (typeof STAFF_STATUSES)[number] }
                : {}),
              page: params.page,
              pageSize: 20,
            },
          },
        }),
      ),
  };
}

export function staffQuery(id: string) {
  return {
    queryKey: ["staff", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/staff/{id}", { params: { path: { id } } })),
  };
}

export function staffLeaveQuery(id: string) {
  return {
    queryKey: ["staff-leave", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/staff/{id}/leave", { params: { path: { id } } })),
  };
}

export function staffAssignmentsQuery(id: string, sessionId: string) {
  return {
    queryKey: ["staff-assignments", id, sessionId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/staff/{id}/assignments", {
          params: { path: { id }, query: { sessionId } },
        }),
      ),
  };
}

export function armTeachersQuery(armId: string, sessionId: string) {
  return {
    queryKey: ["arm-teachers", armId, sessionId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/class-arms/{id}/teachers", {
          params: { path: { id: armId }, query: { sessionId } },
        }),
      ),
  };
}

export function myAssignmentsQuery(sessionId: string) {
  return {
    queryKey: ["my-assignments", sessionId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/me/assignments", {
          params: { query: sessionId !== "" ? { sessionId } : {} },
        }),
      ),
  };
}

export async function createStaff(body: StaffRequest) {
  return unwrap(await apiClient.POST("/api/v1/staff", { body }));
}

export async function updateStaff(id: string, body: StaffRequest) {
  return unwrap(await apiClient.PUT("/api/v1/staff/{id}", { params: { path: { id } }, body }));
}

export async function deactivateStaff(id: string) {
  return unwrap(
    await apiClient.POST("/api/v1/staff/{id}/deactivate", { params: { path: { id } } }),
  );
}

export async function reactivateStaff(id: string) {
  return unwrap(
    await apiClient.POST("/api/v1/staff/{id}/reactivate", { params: { path: { id } } }),
  );
}

export async function inviteStaff(id: string, body: InviteStaffAccountRequest) {
  return unwrap(
    await apiClient.POST("/api/v1/staff/{id}/invite-user", { params: { path: { id } }, body }),
  );
}

export async function saveStaffAssignments(id: string, sessionId: string, rows: AssignmentInput[]) {
  return unwrap(
    await apiClient.PUT("/api/v1/staff/{id}/assignments", {
      params: { path: { id }, query: { sessionId } },
      body: rows,
    }),
  );
}

export async function requestLeave(id: string, body: LeaveRequestBody) {
  return unwrap(
    await apiClient.POST("/api/v1/staff/{id}/leave", { params: { path: { id } }, body }),
  );
}

export async function decideLeave(id: string, decision: "approve" | "reject") {
  return unwrap(
    decision === "approve"
      ? await apiClient.POST("/api/v1/leave/{id}/approve", { params: { path: { id } } })
      : await apiClient.POST("/api/v1/leave/{id}/reject", { params: { path: { id } } }),
  );
}
