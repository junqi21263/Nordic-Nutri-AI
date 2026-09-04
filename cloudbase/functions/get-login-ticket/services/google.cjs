function createGoogleTokenService({ clientId, client } = {}) {
  if (!clientId) throw new Error("Google server client ID is unavailable");
  const verifier = client || new (require("google-auth-library").OAuth2Client)();
  return {
    async verifyIdToken(idToken) {
      if (typeof idToken !== "string" || !idToken.trim()) throw new Error("Google ID token is unavailable");
      const ticket = await verifier.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || payload.iss !== "https://accounts.google.com" || payload.email_verified !== true) {
        throw new Error("Google ID token claims are invalid");
      }
      return payload;
    },
  };
}

module.exports = { createGoogleTokenService };
