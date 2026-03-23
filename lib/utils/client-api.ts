"use client";

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Request failed.");
  }

  return data as T;
}
