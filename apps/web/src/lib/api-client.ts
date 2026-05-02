// NestJS APIへのfetch一元管理。
// JWT発行はサーバー側のみで実行し、クライアントへの露出を防ぐ (ADR-0006)。
// 401 を受け取った場合はセッション切れとみなし /signin に誘導する (issue #44)。

import { redirect } from 'next/navigation';
import type { ApiError, ApiErrorCode } from '@app/shared';
import { issueApiToken, type ApiTokenSubject } from './api-token';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';

export class ApiClientError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(
  path: string,
  subject: ApiTokenSubject,
  init?: RequestInit,
): Promise<T> {
  const token = issueApiToken(subject);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  });
  if (res.status === 401) {
    redirect('/signin');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    const code: ApiErrorCode = body.error?.code ?? 'INTERNAL_ERROR';
    const message = body.error?.message ?? `HTTP ${res.status}`;
    throw new ApiClientError(code, message);
  }
  return res.json() as Promise<T>;
}
