import type { AuthBootstrapStatus } from "./auth-bootstrap";

export interface ApplicationAuthBootstrap {
  start: () => Promise<void>;
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

export function createApplicationLaunch(
  auth: ApplicationAuthBootstrap,
  openHome: () => void | Promise<unknown>,
  openLogin: () => void | Promise<unknown>,
) {
  let inFlight: Promise<void> | null = null;

  const start = () => {
    if (!inFlight) {
      inFlight = auth
        .start()
        .then(async () => {
          if (auth.getStatus() === "authenticated") {
            await openHome();
            return;
          }
          await openLogin();
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
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
