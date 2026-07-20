import type { AppAuthSession, AppAuthUser } from "./auth-store";

function signInError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === "object") {
    const candidate = value as { message?: unknown; code?: unknown; name?: unknown };
    const error = new Error(
      typeof candidate.message === "string" && candidate.message
        ? candidate.message
        : "CloudBase 自定义登录失败",
    );
    if (typeof candidate.name === "string" && candidate.name) error.name = candidate.name;
    else if (typeof candidate.code === "string" && candidate.code) error.name = candidate.code;
    return error;
  }
  return new Error("CloudBase 自定义登录失败");
}

export function assertCloudbaseSignInSucceeded(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("CloudBase 自定义登录未返回结果");
  const result = value as { error?: unknown };
  if (result.error) throw signInError(result.error);
}

export interface CloudbaseSessionCredentialValues {
  access_token: string;
  refresh_token: string;
}

function readCloudbaseSessionCredentialValues(value: unknown): CloudbaseSessionCredentialValues | null {
  if (!value || typeof value !== "object") return null;
  const result = value as { data?: unknown; error?: unknown };
  if (result.error || !result.data || typeof result.data !== "object") return null;
  const data = result.data as { session?: unknown };
  if (!data.session || typeof data.session !== "object") return null;
  const session = data.session as { access_token?: unknown; refresh_token?: unknown };
  if (typeof session.access_token !== "string" || !session.access_token
    || typeof session.refresh_token !== "string" || !session.refresh_token) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
}

export function getCloudbaseSessionCredentials(value: unknown): {
  hasAccessToken: true;
  hasRefreshToken: true;
} | null {
  const credentials = readCloudbaseSessionCredentialValues(value);
  return credentials ? { hasAccessToken: true, hasRefreshToken: true } : null;
}

export function readCloudbaseSessionCredentials(value: unknown): CloudbaseSessionCredentialValues | null {
  return readCloudbaseSessionCredentialValues(value);
}

function asAppUser(value: unknown): AppAuthUser | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { uid?: unknown; id?: unknown; email?: unknown; is_anonymous?: unknown };
  if (candidate.is_anonymous === true) return null;
  const id = typeof candidate.uid === "string" && candidate.uid
    ? candidate.uid
    : typeof candidate.id === "string" && candidate.id
      ? candidate.id
      : null;
  if (!id) return null;
  return { id, email: typeof candidate.email === "string" ? candidate.email : null };
}

export function parseCloudbaseSession(value: unknown): AppAuthSession | null {
  if (!value || typeof value !== "object") return null;
  const result = value as { data?: unknown; error?: unknown };
  if (result.error) return null;
  if (!result.data || typeof result.data !== "object") return null;
  const data = result.data as { session?: unknown };
  if (!data.session || typeof data.session !== "object") return null;
  const session = data.session as { user?: unknown };
  const user = asAppUser(session.user);
  return user ? { user } : null;
}
