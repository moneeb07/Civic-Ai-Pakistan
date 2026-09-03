"use client";

import type {
  AssigneeDto,
  ChatMessageDto,
  ChatParticipantDto,
  ComplaintDto,
  DepartmentDto,
  InviteDto,
  OfficerRole,
  OrganizationDto,
  StageProgressDto,
  WorkflowDto,
  WorkflowValues,
} from "./schema";

/*
 * Typed wrappers around /api/gov/* — the gov twin of src/lib/report/client.ts,
 * kept in one place so no screen re-implements error-shape handling by hand.
 */

interface ApiFailure {
  success: false;
  reason?: string;
  message?: string;
}

export class GovApiError extends Error {
  constructor(
    readonly reason: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "GovApiError";
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  let payload: { success?: boolean; data?: unknown } & ApiFailure;

  try {
    payload = await response.json();
  } catch {
    // A non-JSON body means something upstream failed before the handler ran.
    throw new GovApiError("unreadable", "The server didn't respond properly. Please try again.");
  }

  if (!payload.success) {
    throw new GovApiError(payload.reason, payload.message ?? "Something went wrong.");
  }

  return payload.data as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => unwrap<T>(r));
}

// -- Invites ------------------------------------------------------------------

export function createInvite(values: {
  email: string;
  role: OfficerRole;
  orgId?: string | null;
  deptId?: string | null;
}): Promise<{ inviteId: string; delivered: "terminal" | "smtp" | null }> {
  return post("/api/gov/invites", values);
}

export function listInvites(): Promise<InviteDto[]> {
  return fetch("/api/gov/invites").then((r) => unwrap<InviteDto[]>(r));
}

export function revokeInvite(id: string): Promise<{ revoked: boolean }> {
  return fetch(`/api/gov/invites/${id}`, { method: "DELETE" }).then((r) =>
    unwrap<{ revoked: boolean }>(r),
  );
}

export function acceptInvite(
  token: string,
  values: { name: string; password: string; confirmPassword: string },
): Promise<{ redirectTo: string }> {
  return post(`/api/gov/invites/${token}/accept`, values);
}

// -- Organizations and departments -----------------------------------------------

export function createOrganization(values: {
  name: string;
  code: string;
}): Promise<OrganizationDto> {
  return post("/api/gov/organizations", values);
}

export function createDepartment(values: {
  orgId: string;
  name: string;
  handlesCategories: string[];
}): Promise<DepartmentDto> {
  return post("/api/gov/departments", values);
}

export function listDepartments(orgId: string): Promise<DepartmentDto[]> {
  return fetch(`/api/gov/departments?orgId=${encodeURIComponent(orgId)}`).then((r) =>
    unwrap<DepartmentDto[]>(r),
  );
}

// -- Workflow -----------------------------------------------------------------------

export function getWorkflow(deptId: string): Promise<WorkflowDto> {
  return fetch(`/api/gov/departments/${deptId}/workflow`).then((r) => unwrap<WorkflowDto>(r));
}

export function saveWorkflow(deptId: string, values: WorkflowValues): Promise<WorkflowDto> {
  return fetch(`/api/gov/departments/${deptId}/workflow`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  }).then((r) => unwrap<WorkflowDto>(r));
}

// -- Complaints ----------------------------------------------------------------------

export function listComplaints(): Promise<{ unrouted: ComplaintDto[]; assigned: ComplaintDto[] }> {
  return fetch("/api/gov/complaints").then((r) =>
    unwrap<{ unrouted: ComplaintDto[]; assigned: ComplaintDto[] }>(r),
  );
}

export function getComplaint(reportId: string): Promise<{
  complaint: ComplaintDto;
  progress: StageProgressDto[];
  events: { id: string; eventType: string; createdAt: string; metadata: Record<string, unknown> }[];
}> {
  return fetch(`/api/gov/complaints/${reportId}`).then((r) => unwrap(r));
}

export function routeComplaint(
  reportId: string,
  deptId: string,
): Promise<{ assignmentId: string; message: string }> {
  return post(`/api/gov/complaints/${reportId}/route-to-dept`, { deptId });
}

// -- Assignees ------------------------------------------------------------------

export function addAssignee(
  reportId: string,
  officerId: string,
): Promise<{ startedWorkflow: boolean; assignees: AssigneeDto[]; message: string }> {
  return post(`/api/gov/complaints/${reportId}/assignees`, { officerId });
}

export function removeAssignee(
  reportId: string,
  officerId: string,
): Promise<{ assignees: AssigneeDto[]; message: string }> {
  return fetch(`/api/gov/complaints/${reportId}/assignees/${officerId}`, { method: "DELETE" })
    .then((r) => unwrap<{ assignees: AssigneeDto[]; message: string }>(r));
}

// -- Chat -----------------------------------------------------------------------

export interface ChatPayload {
  messages: ChatMessageDto[];
  participants: ChatParticipantDto[];
  /** True when the server returned only what arrived after `since`. */
  incremental: boolean;
  canPost: boolean;
}

/**
 * Fetches the transcript, or only what has arrived since `since`.
 *
 * The panel polls with `since` so an open conversation costs one small
 * response per tick rather than the whole history.
 */
export function getChat(reportId: string, since?: string): Promise<ChatPayload> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return fetch(`/api/gov/complaints/${reportId}/chat${query}`).then((r) => unwrap<ChatPayload>(r));
}

export function postChatMessage(reportId: string, body: string): Promise<ChatMessageDto> {
  return post(`/api/gov/complaints/${reportId}/chat`, { body });
}

export function advanceStage(
  reportId: string,
  values: { photoUrl?: string | null; note?: string | null },
): Promise<{ resolved: boolean; nextStageId: string | null; message: string }> {
  return post(`/api/gov/complaints/${reportId}/advance`, values);
}

export function reopenComplaint(reportId: string): Promise<{ message: string }> {
  return post(`/api/gov/complaints/${reportId}/reopen`);
}
