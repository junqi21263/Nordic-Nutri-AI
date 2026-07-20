import { describe, expect, it } from "vitest";
import {
  assertCloudbaseSignInSucceeded,
  getCloudbaseSessionCredentials,
  parseCloudbaseSession,
} from "../src/auth/cloudbase-session";
import { resolveCloudbaseRelationalClient } from "../src/lib/cloudbase";

describe("CloudBase session guard", () => {
  it("resolves the callable rdb component to its actual relational client", () => {
    const client = { from: () => null };
    expect(resolveCloudbaseRelationalClient({ rdb: () => client, mysql: { from: () => null } })).toBe(client);
  });

  it("accepts a real session returned by auth.getSession", () => {
    expect(parseCloudbaseSession({
      data: { session: { user: { id: "cloudbase-user" } } },
      error: null,
    })).toEqual({ user: { id: "cloudbase-user", email: null } });
  });

  it("rejects an anonymous session instead of treating it as product login", () => {
    expect(parseCloudbaseSession({
      data: { session: { user: { id: "anonymous-user", is_anonymous: true } } },
      error: null,
    })).toBeNull();
  });

  it("throws the SDK error returned by custom-ticket sign-in", () => {
    expect(() => assertCloudbaseSignInSucceeded({
      data: {},
      error: { code: "INVALID_TICKET", message: "自定义登录凭证已失效" },
    })).toThrow("自定义登录凭证已失效");
  });

  it("extracts both session credentials without exposing their values", () => {
    expect(getCloudbaseSessionCredentials({
      data: {
        session: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          user: { id: "cloudbase-user" },
        },
      },
      error: null,
    })).toEqual({ hasAccessToken: true, hasRefreshToken: true });
  });

  it("does not treat a user-only response as a database-ready session", () => {
    expect(getCloudbaseSessionCredentials({
      data: { session: { user: { id: "cloudbase-user" } } },
      error: null,
    })).toBeNull();
  });
});
