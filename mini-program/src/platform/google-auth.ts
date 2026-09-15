type GoogleAuthCallback = { resolve: (token: string) => void; reject: (error: Error) => void };

export type GoogleIdTokenDiagnostics = {
  length: number;
  segmentCount: number;
  jwtShape: boolean;
  algorithm: string | null;
  issuerValid: boolean;
  audienceMatches: boolean;
  audienceCount: number;
  hasSubject: boolean;
  emailVerified: boolean;
  expiresInSeconds: number | null;
};

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = globalThis.atob(`${normalized}${padding}`);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function summarizeGoogleIdToken(idToken: string, expectedAudience: string): GoogleIdTokenDiagnostics {
  const segments = typeof idToken === "string" ? idToken.split(".") : [];
  const header = segments.length === 3 ? decodeJsonSegment(segments[0]) : null;
  const payload = segments.length === 3 ? decodeJsonSegment(segments[1]) : null;
  const audiences = Array.isArray(payload?.aud)
    ? payload.aud.filter((value): value is string => typeof value === "string")
    : typeof payload?.aud === "string" ? [payload.aud] : [];
  const expiresAt = typeof payload?.exp === "number" ? payload.exp : null;

  return {
    length: idToken.length,
    segmentCount: segments.length,
    jwtShape: segments.length === 3 && segments.every(Boolean) && Boolean(header && payload),
    algorithm: typeof header?.alg === "string" ? header.alg : null,
    issuerValid: payload?.iss === "https://accounts.google.com" || payload?.iss === "accounts.google.com",
    audienceMatches: audiences.includes(expectedAudience),
    audienceCount: audiences.length,
    hasSubject: typeof payload?.sub === "string" && payload.sub.length > 0,
    emailVerified: payload?.email_verified === true,
    expiresInSeconds: expiresAt === null ? null : Math.floor(expiresAt - Date.now() / 1000),
  };
}

declare global {
  interface Window {
    NordicGoogleAuth?: { signIn: (serverClientId: string, callbackId: string) => void };
    __nordicGoogleAuthCallbacks?: Record<string, GoogleAuthCallback>;
  }
}

export function getNativeGoogleIdToken(serverClientId: string): Promise<string> {
  if (typeof window === "undefined" || !window.NordicGoogleAuth) {
    return Promise.reject(new Error("Google sign-in is only available in the Android app"));
  }
  const callbacks = window.__nordicGoogleAuthCallbacks ?? {};
  window.__nordicGoogleAuthCallbacks = callbacks;
  const callbackId = `google-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    callbacks[callbackId] = { resolve, reject };
    window.NordicGoogleAuth?.signIn(serverClientId, callbackId);
  });
}
