import { describe, expect, it } from "vitest";
import { summarizeGoogleIdToken } from "./google-auth";

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "RS256", kid: "test-key" })}.${encode(payload)}.signature`;
}

describe("Google ID token diagnostics", () => {
  it("summarizes a valid-shaped token without exposing token claims", () => {
    const summary = summarizeGoogleIdToken(jwt({
      iss: "https://accounts.google.com",
      aud: "server-client-id",
      sub: "google-sub",
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 300,
    }), "server-client-id");

    expect(summary).toMatchObject({
      segmentCount: 3,
      jwtShape: true,
      algorithm: "RS256",
      issuerValid: true,
      audienceMatches: true,
      hasSubject: true,
      emailVerified: true,
    });
    expect(summary).not.toHaveProperty("token");
    expect(summary).not.toHaveProperty("email");
  });

  it("reports an audience mismatch without revealing the audience value", () => {
    const summary = summarizeGoogleIdToken(jwt({
      iss: "https://accounts.google.com",
      aud: "android-client-id",
      sub: "google-sub",
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 300,
    }), "server-client-id");

    expect(summary).toMatchObject({
      jwtShape: true,
      issuerValid: true,
      audienceMatches: false,
      hasSubject: true,
      emailVerified: true,
    });
    expect(summary).not.toHaveProperty("audience");
  });

  it("accepts Google's legacy issuer form in diagnostics", () => {
    const summary = summarizeGoogleIdToken(jwt({
      iss: "accounts.google.com",
      aud: "server-client-id",
      sub: "google-sub",
      email_verified: true,
    }), "server-client-id");

    expect(summary).toMatchObject({
      issuerValid: true,
      audienceMatches: true,
    });
  });
});
