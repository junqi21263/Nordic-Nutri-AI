import { describe, expect, it, vi } from "vitest";
import {
  createApplicationLaunch,
  createRuntimeApplicationLaunch,
} from "../src/auth/application-launch";

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
      {
        start: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue("unauthenticated"),
      },
      openHome,
      openLogin,
    );

    await launch.start();

    expect(openLogin).toHaveBeenCalledTimes(1);
    expect(openHome).not.toHaveBeenCalled();
  });

  it("shares one app launch operation", async () => {
    let resolveStart: (() => void) | undefined;
    const start = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
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

  it("force restart routes from the latest auth status after login", async () => {
    let resolveFirst: (() => void) | undefined;
    let status: "authenticated" | "unauthenticated" = "unauthenticated";
    const getStatus = vi.fn(() => status);
    const start = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const openHome = vi.fn();
    const openLogin = vi.fn();
    const launch = createApplicationLaunch({ start, getStatus }, openHome, openLogin);

    const first = launch.start();
    status = "authenticated";
    const second = launch.start({ force: true });
    resolveFirst?.();
    await Promise.all([first, second]);

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith({ force: true });
    expect(openLogin).not.toHaveBeenCalled();
    expect(openHome).toHaveBeenCalledTimes(1);
  });

  it("opens welcome before onboarding for an authenticated first-time user", async () => {
    const openHome = vi.fn();
    const openOnboarding = vi.fn();
    const openLogin = vi.fn();
    const openWelcome = vi.fn();
    const launch = createRuntimeApplicationLaunch(
      {
        start: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue("authenticated"),
      },
      {
        isOnboardingCompleted: () => false,
        hasSeenWelcome: () => false,
        openHome,
        openOnboarding,
        openLogin,
        openWelcome,
      },
    );

    await launch.start();

    expect(openWelcome).toHaveBeenCalledTimes(1);
    expect(openOnboarding).not.toHaveBeenCalled();
    expect(openHome).not.toHaveBeenCalled();
    expect(openLogin).not.toHaveBeenCalled();
  });

  it("opens onboarding after welcome was seen for an authenticated first-time user", async () => {
    const openHome = vi.fn();
    const openOnboarding = vi.fn();
    const openLogin = vi.fn();
    const openWelcome = vi.fn();
    const launch = createRuntimeApplicationLaunch(
      {
        start: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue("authenticated"),
      },
      {
        isOnboardingCompleted: () => false,
        hasSeenWelcome: () => true,
        openHome,
        openOnboarding,
        openLogin,
        openWelcome,
      },
    );

    await launch.start();

    expect(openOnboarding).toHaveBeenCalledTimes(1);
    expect(openWelcome).not.toHaveBeenCalled();
    expect(openHome).not.toHaveBeenCalled();
    expect(openLogin).not.toHaveBeenCalled();
  });

  it("opens welcome before login when the bootstrap cannot authenticate", async () => {
    const openWelcome = vi.fn();
    const openLogin = vi.fn();
    const launch = createRuntimeApplicationLaunch(
      {
        start: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue("unauthenticated"),
      },
      {
        isOnboardingCompleted: () => false,
        hasSeenWelcome: () => false,
        openHome: vi.fn(),
        openOnboarding: vi.fn(),
        openLogin,
        openWelcome,
      },
    );

    await launch.start();

    expect(openWelcome).toHaveBeenCalledTimes(1);
    expect(openLogin).not.toHaveBeenCalled();
  });
});
