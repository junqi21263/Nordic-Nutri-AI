export type AuthView =
  | "landing"
  | "email-login"
  | "phone-login"
  | "email-register"
  | "email-register-otp"
  | "email-register-password"
  | "phone-register"
  | "phone-register-otp"
  | "phone-register-password"
  | "forgot-email"
  | "forgot-phone"
  | "reset-password"
  | "google-connecting"
  | "success";

export function getForgotPasswordView(method: "email" | "phone"): AuthView {
  return method === "phone" ? "forgot-phone" : "forgot-email";
}

export function getAuthInputError(
  type: "email" | "phone",
  target: string,
  captchaId?: string,
  answer = "",
  requireCaptcha = true,
) {
  const normalized = target.trim();
  if (type === "email" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320)) {
    return "androidAuth.validation.email";
  }
  if (type === "phone" && !/^\+[1-9]\d{7,14}$/.test(normalized)) return "androidAuth.validation.phone";
  if (!requireCaptcha) return "";
  if (!captchaId) return "androidAuth.validation.captchaLoad";
  if (!answer.trim()) return "androidAuth.validation.captchaRequired";
  return "";
}

const previousView: Partial<Record<AuthView, AuthView>> = {
  "email-login": "landing",
  "phone-login": "landing",
  "email-register": "email-login",
  "email-register-otp": "email-register",
  "email-register-password": "email-register-otp",
  "phone-register": "phone-login",
  "phone-register-otp": "phone-register",
  "phone-register-password": "phone-register-otp",
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
