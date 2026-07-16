import { describe, expect, it, vi } from "vitest";
import { createApplicationLaunch, createRuntimeApplicationLaunch } from "../src/auth/application-launch";

describe("application launch", () => {
  it("waits for authentication and opens the home tab for an authenticated returning user", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const getStatus = vi.fn().mockReturnValue("authenticated");
    const openHome = vi.fn();
    const openLogin = vi.fn();
    const launch = createApplicationLaunch({ start, getStatus }, openHome, openLogin);

    await launch.start();

    expect(start).toHaveBeenCalledTimes(1);
    expect(openHome).toHaveBeenCalledTimes(1);
    expect(openLogin).not.toHaveBeenCalled();
  });

  it("opens the manual login entry when the bootstrap cannot authenticate", async () => {
    const openHome = vi.fn();
    const openLogin = vi.fn();
    const launch = createApplicationLaunch(
      { start: vi.fn().mockResolvedValue(undefined), getStatus: vi.fn().mockReturnValue("unauthenticated") },
      openHome,
      openLogin,
    );

    await launch.start();

    expect(openLogin).toHaveBeenCalledTimes(1);
    expect(openHome).not.toHaveBeenCalled();
  });

  it("shares one app launch operation", async () => {
    let resolveStart: (() => void) | undefined;
    const start = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    const openHome = vi.fn();
    const launch = createApplicationLaunch(
      { start, getStatus: vi.fn().mockReturnValue("authenticated") },
      openHome,
      vi.fn(),
    );

    const first = launch.start();
    const second = launch.start();
    resolveStart?.();
    await Promise.all([first, second]);

    expect(start).toHaveBeenCalledTimes(1);
    expect(openHome).toHaveBeenCalledTimes(1);
  });

  it("keeps an authenticated first-time user on onboarding instead of opening the login entry", async () => {
    const openHome = vi.fn();
    const openOnboarding = vi.fn();
    const openLogin = vi.fn();
    const launch = createRuntimeApplicationLaunch(
      { start: vi.fn().mockResolvedValue(undefined), getStatus: vi.fn().mockReturnValue("authenticated") },
      {
        isOnboardingCompleted: () => false,
        openHome,
        openOnboarding,
        openLogin,
      },
    );

    await launch.start();

    expect(openOnboarding).toHaveBeenCalledTimes(1);
    expect(openHome).not.toHaveBeenCalled();
    expect(openLogin).not.toHaveBeenCalled();
  });
});
