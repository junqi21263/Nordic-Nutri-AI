import { describe, expect, it, vi } from "vitest";
import { createLogoutFlow } from "../src/auth/logout-flow";

describe("logout flow", () => {
  it("clears the local session before returning the user to the manual login entry", async () => {
    const steps: string[] = [];
    const logout = createLogoutFlow({
      signOut: async () => {
        steps.push("sign-out");
      },
      openLogin: async () => {
        steps.push("open-login");
      },
    });

    await logout.run();

    expect(steps).toEqual(["sign-out", "open-login"]);
  });

  it("does not run two logout operations at once", async () => {
    let resolveSignOut: (() => void) | undefined;
    const signOut = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    const openLogin = vi.fn();
    const logout = createLogoutFlow({ signOut, openLogin });

    const first = logout.run();
    const second = logout.run();
    resolveSignOut?.();
    await Promise.all([first, second]);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(openLogin).toHaveBeenCalledTimes(1);
  });
});
