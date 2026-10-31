import type { AuthStatus, ErrorEnvelope } from "@maintenance-tracker/shared";

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

export interface EquipmentRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  meterKind: "none" | "hours" | "miles";
  reading: number | null;
  readingUpdatedAt: string | null;
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
  },
};
