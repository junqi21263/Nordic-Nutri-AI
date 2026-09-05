import { describe, expect, it } from "vitest";
import { getAuthBackState, type AuthView } from "./auth-state";

describe("Android auth navigation", () => {
  it("closes the country picker before leaving the auth flow", () => {
    expect(getAuthBackState("phone-register", true)).toEqual({ view: "phone-register", closePicker: true });
  });

  it("returns each auth step to its logical previous view", () => {
    const cases: Array<[AuthView, AuthView]> = [
      ["email-login", "landing"],
      ["phone-login", "landing"],
      ["email-register", "email-login"],
      ["email-register-otp", "email-register"],
      ["phone-register", "phone-login"],
      ["phone-register-otp", "phone-register"],
      ["forgot-email", "email-login"],
      ["forgot-phone", "phone-login"],
      ["reset-password", "forgot-email"],
    ];

    for (const [view, expected] of cases) {
      expect(getAuthBackState(view, false)).toEqual({ view: expected, closePicker: false });
    }

    expect(getAuthBackState("reset-password", false, "phone")).toEqual({ view: "forgot-phone", closePicker: false });
  });
});
