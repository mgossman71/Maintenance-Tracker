import type {
  AuthStatus,
  ErrorEnvelope,
  TaskPresetInfo,
  TaskWithDue,
} from "@maintenance-tracker/shared";

/** Typed API client — cookies ride along, every error surfaces as ApiError. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: { path: string; message: string }[],
  ) {
    super(`${code}${details?.length ? `: ${details[0]?.message}` : ""}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const envelope = payload as ErrorEnvelope | null;
    throw new ApiError(
      envelope?.error?.code ?? `http_${res.status}`,
      res.status,
      envelope?.error?.details,
    );
  }
  return payload as T;
}

export interface SessionInfo {
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

export type MeterKind = "none" | "hours" | "miles";

export interface EquipmentRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  meterKind: MeterKind;
  reading: number | null;
  readingUpdatedAt: string | null;
  createdAt: string;
}

export interface EquipmentCreateInput {
  name: string;
  description?: string | null;
  icon?: string;
  meterKind?: MeterKind;
}

export interface EquipmentUpdateInput {
  name?: string;
  description?: string | null;
  icon?: string;
  meterKind?: MeterKind;
}

export interface TaskCreateInput {
  name: string;
  description?: string | null;
  kind: "interval" | "expiry";
  monthsInterval?: number | null;
  meterInterval?: number | null;
  currentExpiryDate?: string | null;
}

export type TaskUpdateInput = Partial<Omit<TaskCreateInput, "kind">>;

export interface TaskPresetInput {
  name: string;
  monthsInterval?: number | null;
  meterInterval?: number | null;
}

export const api = {
  status: () => request<AuthStatus>("/api/auth/status"),
  setup: (password: string) =>
    request<SessionInfo>("/api/auth/setup", { method: "POST", body: { password } }),
  login: (password: string) =>
    request<SessionInfo>("/api/auth/login", { method: "POST", body: { password } }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  session: () => request<SessionInfo>("/api/auth/session"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/api/auth/password", { method: "POST", body: { currentPassword, newPassword } }),
  equipment: {
    list: () => request<EquipmentRow[]>("/api/equipment"),
    get: (id: string) => request<EquipmentRow>(`/api/equipment/${id}`),
    create: (input: EquipmentCreateInput) =>
      request<EquipmentRow>("/api/equipment", { method: "POST", body: input }),
    update: (id: string, patch: EquipmentUpdateInput) =>
      request<EquipmentRow>(`/api/equipment/${id}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request<void>(`/api/equipment/${id}`, { method: "DELETE" }),
    /**
     * Meter flows, one endpoint (§2): higher or equal = normal update,
     * equal = "same reading" dismissal, lower REQUIRES `correct: true` —
     * the explicit acknowledgment that the old value was a typo.
     */
    setReading: (id: string, reading: number, opts?: { date?: string; correct?: boolean }) =>
      request<EquipmentRow>(`/api/equipment/${id}/reading`, {
        method: "POST",
        body: {
          reading,
          ...(opts?.date ? { date: opts.date } : {}),
          ...(opts?.correct ? { correct: true } : {}),
        },
      }),
    tasks: (id: string) => request<TaskWithDue[]>(`/api/equipment/${id}/tasks`),
    createTask: (id: string, input: TaskCreateInput) =>
      request<TaskWithDue>(`/api/equipment/${id}/tasks`, { method: "POST", body: input }),
  },
  tasks: {
    update: (id: string, patch: TaskUpdateInput) =>
      request<unknown>(`/api/tasks/${id}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request<void>(`/api/tasks/${id}`, { method: "DELETE" }),
  },
  presets: {
    list: () => request<TaskPresetInfo[]>("/api/presets"),
    create: (input: TaskPresetInput) =>
      request<TaskPresetInfo>("/api/presets", { method: "POST", body: input }),
    update: (id: string, patch: Partial<TaskPresetInput>) =>
      request<TaskPresetInfo>(`/api/presets/${id}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request<void>(`/api/presets/${id}`, { method: "DELETE" }),
  },
};
