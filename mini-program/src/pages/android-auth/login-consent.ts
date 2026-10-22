export async function applyLoginConsentAfterSessionBootstrap(
  accepted: boolean,
  bootstrap: () => Promise<boolean>,
  setPreference: (value: { analytics: boolean; diagnostics: boolean }) => void,
) {
  if (!await bootstrap()) return;
  setPreference({ analytics: accepted, diagnostics: accepted });
}
