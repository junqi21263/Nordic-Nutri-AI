export interface LogoutDependencies {
  signOut: () => Promise<void>;
  openLogin: () => void | Promise<unknown>;
}

export function createLogoutFlow(dependencies: LogoutDependencies) {
  let inFlight: Promise<void> | null = null;

  const run = () => {
    if (!inFlight) {
      inFlight = dependencies
        .signOut()
        .then(() => dependencies.openLogin())
        .then(() => undefined)
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };

  return { run };
}
