// src/lib/api.ts
//
// Thin fetch wrapper hitting the existing Fiix Next.js API routes.
// Auth: every call carries `Authorization: Bearer <clerk session token>`.
// @clerk/nextjs's `auth()` (used by every route via requireRole()) accepts
// a bearer token exactly the same way it accepts the web app's session
// cookie — no server-side changes needed to support this client.
//
// `getToken` is injected from a React hook (Clerk's `useAuth().getToken`)
// because token retrieval is async and session-aware; see useApi() below.
import { API_BASE_URL } from "@/config";

export class ApiError extends Error {
  status: number;
  body: unknown;
  url: string;
  constructor(status: number, message: string, url: string, body?: unknown) {
    super(message);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

type GetToken = () => Promise<string | null>;

async function request<T>(
  getToken: GetToken,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const url = `${API_BASE_URL}${path}`;
  // Logged unconditionally (not just on error) so the very first call after
  // sign-in shows up in the Metro terminal even if something upstream of
  // this function is silently swallowing the request — this was added
  // specifically while debugging a 404 that turned out to need seeing the
  // literal outgoing URL to diagnose, rather than guessing from symptoms.
  // Also logs whether a token was actually obtained (not the token itself)
  // — if this ever prints "token: NO" right after a successful sign-in,
  // that's the smoking gun for an auth-layer problem (e.g. running in Expo
  // Go, where @clerk/expo's native module isn't available) rather than a
  // routing/URL problem.
  console.log(`[api] ${options.method ?? "GET"} ${url} (token: ${token ? "YES" : "NO"})`);
  const res = await fetch(url, { ...options, headers });
  if (res.redirected) {
    // fetch() follows redirects by default — if the server sent one (e.g.
    // Clerk's middleware redirecting an unauthenticated request toward a
    // sign-in page instead of returning a clean 401), the final landing
    // URL after following it is what actually produced the status below,
    // not the URL we requested. Worth knowing before assuming a routing
    // problem at the URL we intended to hit.
    console.log(`[api] REDIRECTED ${url} -> ${res.url}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && String((body as any).error)) ||
      `Request failed: ${res.status} ${res.statusText}`;
    console.log(`[api] FAILED ${res.status} ${url}`, body);
    throw new ApiError(res.status, message, url, body);
  }

  return body as T;
}

/** Bind a getToken function once (from useAuth()) and get a small typed client. */
export function createApiClient(getToken: GetToken) {
  return {
    get: <T>(path: string) => request<T>(getToken, path),
    post: <T>(path: string, data?: unknown) =>
      request<T>(getToken, path, {
        method: "POST",
        body: data !== undefined ? JSON.stringify(data) : undefined,
      }),
    patch: <T>(path: string, data?: unknown) =>
      request<T>(getToken, path, {
        method: "PATCH",
        body: data !== undefined ? JSON.stringify(data) : undefined,
      }),
    put: <T>(path: string, data?: unknown) =>
      request<T>(getToken, path, {
        method: "PUT",
        body: data !== undefined ? JSON.stringify(data) : undefined,
      }),
    del: <T>(path: string) => request<T>(getToken, path, { method: "DELETE" }),
    /** For multipart/form-data uploads (photos) — no Content-Type override. */
    postForm: <T>(path: string, form: FormData) =>
      request<T>(getToken, path, { method: "POST", body: form as unknown as BodyInit }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
