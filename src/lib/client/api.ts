"use client";

import type { ApiFailure, ApiResponse } from "@/types/api";

/**
 * Browser-side fetch wrapper for the admin API. Handles the response
 * envelope, surfaces 401 as a typed error so pages can bounce to /login, and
 * never sends credentials anywhere but this origin (cookies are same-origin).
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

const SAME_ORIGIN: RequestInit = { credentials: "same-origin" };

async function parseEnvelope<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return { ok: false, error: { code: "internal_error", message: "Unexpected server response." } };
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, SAME_ORIGIN);
  const envelope = await parseEnvelope<T>(response);
  if (!envelope.ok) {
    throw new ApiClientError(response.status, envelope.error.code, envelope.error.message);
  }
  return envelope.data;
}

export async function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const response = await fetch(path, {
    ...SAME_ORIGIN,
    method,
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const envelope = await parseEnvelope<T>(response);
  if (!envelope.ok) {
    throw new ApiClientError(response.status, envelope.error.code, envelope.error.message);
  }
  return envelope.data;
}

/** Redirects to /login when the API reports the session is missing/expired. */
export function handleAuthError(error: unknown): boolean {
  if (error instanceof ApiClientError && error.status === 401) {
    const next = typeof window !== "undefined" ? window.location.assign : undefined;
    if (next !== undefined) {
      void next("/login");
    }
    return true;
  }
  return false;
}

export function errorMessageFor(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export type { ApiFailure };
