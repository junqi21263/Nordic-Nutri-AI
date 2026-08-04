import type { AuthBootstrapStatus } from "./auth-bootstrap";

export interface ApplicationAuthBootstrap {
  start: (options?: { force?: boolean; allowSilentLogin?: boolean }) => Promise<void>;
  getStatus: () => AuthBootstrapStatus;
}

export interface ApplicationDestinationDependencies {
  isOnboardingCompleted: () => boolean;
  hasSeenWelcome: () => boolean;
  openHome: () => void | Promise<unknown>;
  openOnboarding: () => void | Promise<unknown>;
  openLogin: () => void | Promise<unknown>;
  openWelcome: () => void | Promise<unknown>;
}

export interface ApplicationLaunchStartOptions {
  /** After login, discard a pre-login launch and route from the fresh session. */
  force?: boolean;
  /** Welcome CTA: run wx.login when no usable session remains. */
  allowSilentLogin?: boolean;
}

export function createApplicationLaunch(
  auth: ApplicationAuthBootstrap,
  openHome: () => void | Promise<unknown>,
  openLogin: () => void | Promise<unknown>,
) {
  let inFlight: Promise<void> | null = null;
  let launchId = 0;

  const start = ({
    force = false,
    allowSilentLogin,
  }: ApplicationLaunchStartOptions = {}) => {
    if (!inFlight || force) {
      const id = ++launchId;
      const promise = auth
        .start({ force, allowSilentLogin })
        .then(async () => {
          if (id !== launchId) return;
          if (auth.getStatus() === "authenticated") {
            await openHome();
            return;
          }
          await openLogin();
        })
        .finally(() => {
          if (inFlight === promise) inFlight = null;
        });
      inFlight = promise;
    }
    return inFlight as Promise<void>;
  };

  return { start };
}

export function createRuntimeApplicationLaunch(
  auth: ApplicationAuthBootstrap,
  destinations: ApplicationDestinationDependencies,
) {
  const openAuthenticatedDestination = () => {
    if (destinations.isOnboardingCompleted()) return destinations.openHome();
    if (!destinations.hasSeenWelcome()) return destinations.openWelcome();
    return destinations.openOnboarding();
  };

  const openUnauthenticatedDestination = () => {
    if (!destinations.hasSeenWelcome()) return destinations.openWelcome();
    return destinations.openLogin();
  };

  return createApplicationLaunch(
    auth,
    openAuthenticatedDestination,
    openUnauthenticatedDestination,
  );
}
