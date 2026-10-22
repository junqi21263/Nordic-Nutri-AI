import { describe, expect, it, vi } from "vitest";
import { applyLoginConsentAfterSessionBootstrap } from "./login-consent";

describe("login analytics consent", () => {
  it("applies the checked agreement only after authenticated session bootstrap", async () => {
    const calls: string[] = [];
    let finishBootstrap!: () => void;
    const bootstrap = new Promise<void>((resolve) => { finishBootstrap = resolve; });
    const setPreference = vi.fn((value: { analytics: boolean; diagnostics: boolean }) => {
      calls.push(`consent:${value.analytics}:${value.diagnostics}`);
    });

    const applying = applyLoginConsentAfterSessionBootstrap(true, async () => {
      calls.push("bootstrap");
      await bootstrap;
      calls.push("authenticated");
      return true;
    }, setPreference);

    expect(setPreference).not.toHaveBeenCalled();
    finishBootstrap();
    await applying;

    expect(calls).toEqual(["bootstrap", "authenticated", "consent:true:true"]);
  });

  it("does not apply login consent when session bootstrap fails", async () => {
    const setPreference = vi.fn();
    await applyLoginConsentAfterSessionBootstrap(false, async () => false, setPreference);
    expect(setPreference).not.toHaveBeenCalled();
  });
});
