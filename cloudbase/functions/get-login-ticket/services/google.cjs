class GoogleTokenError extends Error {
  constructor() {
    super("Google token invalid");
    this.code = "AUTH_GOOGLE_TOKEN_INVALID";
  }
}

function createGoogleVerifier({ audience, verifyIdToken, now = Date.now } = {}) {
  if (!audience) throw new Error("Google server client ID is unavailable");
  const verify = verifyIdToken || (async (idToken, expectedAudience) => {
    const { OAuth2Client } = require("google-auth-library");
    return new OAuth2Client().verifyIdToken({ idToken, audience: expectedAudience });
  });
  return {
    async verify(idToken) {
      if (typeof idToken !== "string" || !idToken.trim()) throw new GoogleTokenError();
      let ticket;
      try {
        ticket = await verify(idToken, audience);
      } catch {
        throw new GoogleTokenError();
      }
      const payload = ticket?.getPayload?.();
      const issuerValid = payload?.iss === "accounts.google.com" || payload?.iss === "https://accounts.google.com";
      const audienceValid = payload?.aud === audience;
      const expiryValid = Number.isInteger(payload?.exp) && payload.exp > Math.floor(now() / 1000);
      if (!issuerValid || !audienceValid || !expiryValid || typeof payload?.sub !== "string" || !payload.sub) {
        throw new GoogleTokenError();
      }
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : undefined,
        email_verified: payload.email_verified === true,
      };
    },
  };
}

module.exports = { GoogleTokenError, createGoogleVerifier };
