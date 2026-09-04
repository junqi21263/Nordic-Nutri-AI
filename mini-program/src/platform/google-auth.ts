type GoogleAuthCallback = { resolve: (token: string) => void; reject: (error: Error) => void };

declare global {
  interface Window {
    NordicGoogleAuth?: { signIn: (serverClientId: string, callbackId: string) => void };
    __nordicGoogleAuthCallbacks?: Record<string, GoogleAuthCallback>;
  }
}

export function getNativeGoogleIdToken(serverClientId: string): Promise<string> {
  if (typeof window === "undefined" || !window.NordicGoogleAuth) {
    return Promise.reject(new Error("Google sign-in is only available in the Android app"));
  }
  const callbacks = window.__nordicGoogleAuthCallbacks ?? {};
  window.__nordicGoogleAuthCallbacks = callbacks;
  const callbackId = `google-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    callbacks[callbackId] = { resolve, reject };
    window.NordicGoogleAuth?.signIn(serverClientId, callbackId);
  });
}

