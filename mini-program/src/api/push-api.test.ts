import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./product-api-client", () => ({ requestProductApi: vi.fn() }));
vi.mock("../i18n", () => ({ getLocale: () => "en" }));

describe("ANDROID_PUSH_PACKAGE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the production application id for production builds", async () => {
    vi.stubEnv("TARO_APP_ENV", "production");
    vi.resetModules();

    const { ANDROID_PUSH_PACKAGE } = await import("./push-api");

    expect(ANDROID_PUSH_PACKAGE).toBe("com.lewislee.nordicnutri");
  });

  it("keeps the dev application id for dev builds", async () => {
    vi.stubEnv("TARO_APP_ENV", "development");
    vi.resetModules();

    const { ANDROID_PUSH_PACKAGE } = await import("./push-api");

    expect(ANDROID_PUSH_PACKAGE).toBe("com.lewislee.nordicnutri.dev");
  });
});
