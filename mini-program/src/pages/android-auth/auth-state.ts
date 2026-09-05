export type AuthView =
  | "landing"
  | "email-login"
  | "phone-login"
  | "email-register"
  | "email-register-otp"
  | "phone-register"
  | "phone-register-otp"
  | "forgot-email"
  | "forgot-phone"
  | "reset-password"
  | "google-connecting"
  | "success";

const previousView: Partial<Record<AuthView, AuthView>> = {
  "email-login": "landing",
  "phone-login": "landing",
  "email-register": "email-login",
  "email-register-otp": "email-register",
  "phone-register": "phone-login",
  "phone-register-otp": "phone-register",
  "forgot-email": "email-login",
  "forgot-phone": "phone-login",
  "reset-password": "forgot-email",
  "google-connecting": "landing",
  success: "landing",
};

export function getAuthBackState(view: AuthView, countryPickerOpen: boolean, method: "email" | "phone" = "email") {
  const previous = view === "reset-password" && method === "phone" ? "forgot-phone" : previousView[view] ?? view;
  return {
    view: countryPickerOpen ? view : previous,
    closePicker: countryPickerOpen,
  };
}
