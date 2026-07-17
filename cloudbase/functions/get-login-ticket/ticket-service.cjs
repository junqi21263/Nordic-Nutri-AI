const { createHmac } = require("node:crypto");

class PublicTicketError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function identityProofForOpenId(openid, identityPepper) {
  if (typeof openid !== "string" || !openid || typeof identityPepper !== "string" || !identityPepper) {
    throw new Error("A valid OpenID and identity pepper are required");
  }

  return createHmac("sha256", identityPepper)
    .update(`openid:${openid}`)
    .digest("hex");
}

function assertWechatCode(code) {
  if (typeof code !== "string" || !code.trim() || code.length > 2048) {
    throw new PublicTicketError("WECHAT_CODE_INVALID", "微信登录凭据无效，请重试");
  }
  return code.trim();
}

function createTicketService({ exchangeCode, createTicket, identityPepper }) {
  if (typeof exchangeCode !== "function" || typeof createTicket !== "function" || !identityPepper) {
    throw new Error("Ticket service dependencies are not configured");
  }

  return {
    async issue({ code }) {
      const validCode = assertWechatCode(code);
      let identity;

      try {
        identity = await exchangeCode(validCode);
      } catch {
        throw new PublicTicketError("WECHAT_LOGIN_FAILED", "微信登录暂时不可用，请稍后重试");
      }

      if (!identity || typeof identity.openid !== "string" || !identity.openid) {
        throw new PublicTicketError("WECHAT_LOGIN_FAILED", "微信登录暂时不可用，请稍后重试");
      }

      try {
        const ticket = await createTicket(identity.openid);
        if (typeof ticket !== "string" || !ticket) throw new Error("Ticket is empty");

        return {
          ticket,
          identityProof: identityProofForOpenId(identity.openid, identityPepper),
        };
      } catch {
        throw new PublicTicketError("TICKET_ISSUE_FAILED", "登录服务暂时不可用，请稍后重试");
      }
    },
  };
}

module.exports = {
  PublicTicketError,
  createTicketService,
  identityProofForOpenId,
};
