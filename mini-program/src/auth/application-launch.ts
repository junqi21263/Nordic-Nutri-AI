import type { AuthBootstrapStatus } from "./auth-bootstrap";

export interface ApplicationAuthBootstrap {
  start: () => Promise<void>;
  getStatus: () => AuthBootstrapStatus;
}

export interface ApplicationDestinationDependencies {
  isOnboardingCompleted: () => boolean;
  openHome: () => void | Promise<unknown>;
  openOnboarding: () => void | Promise<unknown>;
  openLogin: () => void | Promise<unknown>;
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
  return createApplicationLaunch(
    auth,
    () =>
      destinations.isOnboardingCompleted()
        ? destinations.openHome()
        : destinations.openOnboarding(),
    destinations.openLogin,
  );
}
