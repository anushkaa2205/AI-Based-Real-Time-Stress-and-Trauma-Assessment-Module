"use client";

/** Small fetch helpers for the victim API. The session lives in an HttpOnly cookie. */
import type { EmergencyPanel, Prompt } from "@/contracts/victim";

export interface Turn {
  next: Prompt;
  showEmergencyPanel: boolean;
  emergency: EmergencyPanel | null;
}

export class VictimApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function api<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/api/v1/victim${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new VictimApiError(res.status, (data as { code?: string }).code ?? "ERROR");
  return data as T;
}

export const NOTICE_VERSION = "2026-11-v1";
