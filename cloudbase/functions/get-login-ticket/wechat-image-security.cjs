const crypto = require("node:crypto");
const https = require("node:https");

const MAX_SEC_BYTES = 900 * 1024;
const MAX_SEC_WIDTH = 750;
const MAX_SEC_HEIGHT = 1334;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

class PublicImageSecurityError extends Error {
  constructor(code, message = "图片安全审核失败") {
    super(message);
    this.code = code;
  }
}

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    return null;
  }
}

function httpsJson(url, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ statusCode: res.statusCode || 0, json: JSON.parse(raw || "{}"), raw });
          } catch (error) {
            reject(new Error(`WeChat JSON parse failed: ${error.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function buildMultipart(buffer, filename, contentType) {
  const boundary = `----WxImgSec${crypto.randomBytes(12).toString("hex")}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([header, buffer, footer]),
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`,
  };
}

function extensionForContentType(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

async function prepareMediaForImgSecCheck(buffer, contentType, { sharpFactory = loadSharp } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new PublicImageSecurityError("VISION_IMAGE_INVALID", "图片无效，请重新拍摄");
  }

  const sharp = typeof sharpFactory === "function" ? sharpFactory() : null;
  const needsCompress = buffer.length > MAX_SEC_BYTES;

  if (!sharp) {
    if (needsCompress) {
      console.error(
        "[wechat-image-security] sharp unavailable; cannot shrink",
        buffer.length,
        "bytes for img_sec_check (limit",
        MAX_SEC_BYTES,
        ")",
      );
      throw new PublicImageSecurityError(
        "VISION_IMAGE_INVALID",
        "图片过大，请压缩后重试",
      );
    }
    return {
      buffer,
      contentType: contentType === "image/png" || contentType === "image/gif" ? contentType : "image/jpeg",
    };
  }

  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    const width = metadata?.width || 0;
    const height = metadata?.height || 0;
    const tooLarge =
      needsCompress
      || width > MAX_SEC_WIDTH
      || height > MAX_SEC_HEIGHT
      || (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/gif");

    if (!tooLarge) {
      return {
        buffer,
        contentType: contentType === "image/png" || contentType === "image/gif" ? contentType : "image/jpeg",
      };
    }

    const resized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: MAX_SEC_WIDTH,
        height: MAX_SEC_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    if (resized.length > 1024 * 1024) {
      for (const quality of [65, 50, 38, 28]) {
        const tighter = await sharp(resized, { failOn: "none" })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        if (tighter.length <= 1024 * 1024) {
          return { buffer: tighter, contentType: "image/jpeg" };
        }
      }
      throw new PublicImageSecurityError("VISION_IMAGE_INVALID", "图片过大，请压缩后重试");
    }

    return { buffer: resized, contentType: "image/jpeg" };
  } catch (error) {
    if (error instanceof PublicImageSecurityError) throw error;
    console.warn("[wechat-image-security] compress failed:", error?.message || error);
    throw new PublicImageSecurityError("VISION_IMAGE_INVALID", "图片处理失败，请更换后重试");
  }
}

function createWechatImageSecurity({
  appId,
  appSecret,
  fetchJson = httpsJson,
  sharpFactory = loadSharp,
  now = () => Date.now(),
} = {}) {
  if (!appId || !appSecret) {
    throw new Error("WeChat image security credentials are unavailable");
  }

  let cachedToken = null;
  let cachedExpiresAt = 0;

  async function getAccessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && cachedToken && now() < cachedExpiresAt - TOKEN_REFRESH_SKEW_MS) {
      return cachedToken;
    }
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
    const { json } = await fetchJson(url);
    if (!json?.access_token) {
      console.error("[wechat-image-security] token error:", json?.errcode, json?.errmsg);
      throw new PublicImageSecurityError("VISION_SECURITY_CHECK_FAILED", "图片安全审核暂时不可用，请稍后重试");
    }
    cachedToken = json.access_token;
    const expiresInMs = Math.max(60, Number(json.expires_in) || 7200) * 1000;
    cachedExpiresAt = now() + expiresInMs;
    return cachedToken;
  }

  async function assertImageAllowed({ buffer, contentType }) {
    const prepared = await prepareMediaForImgSecCheck(buffer, contentType, { sharpFactory });
    const filename = `media.${extensionForContentType(prepared.contentType)}`;
    const multipart = buildMultipart(prepared.buffer, filename, prepared.contentType);

    const postCheck = async (token) => {
      const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${encodeURIComponent(token)}`;
      return fetchJson(url, {
        method: "POST",
        headers: {
          "Content-Type": multipart.contentTypeHeader,
          "Content-Length": String(multipart.body.length),
        },
        body: multipart.body,
      });
    };

    let token = await getAccessToken();
    let response;
    try {
      response = await postCheck(token);
    } catch (error) {
      console.error("[wechat-image-security] request failed:", error?.message || error);
      throw new PublicImageSecurityError("VISION_SECURITY_CHECK_FAILED", "图片安全审核暂时不可用，请稍后重试");
    }

    // Stale token — refresh once and retry.
    if (response.json?.errcode === 40001 || response.json?.errcode === 42001) {
      token = await getAccessToken({ forceRefresh: true });
      try {
        response = await postCheck(token);
      } catch (error) {
        console.error("[wechat-image-security] retry failed:", error?.message || error);
        throw new PublicImageSecurityError("VISION_SECURITY_CHECK_FAILED", "图片安全审核暂时不可用，请稍后重试");
      }
    }

    const errcode = Number(response.json?.errcode ?? -1);
    if (errcode === 0) return { ok: true };

    if (errcode === 87014) {
      throw new PublicImageSecurityError("VISION_CONTENT_BLOCKED", "图片含有违规内容，请更换后重试");
    }

    console.error("[wechat-image-security] check rejected:", errcode, response.json?.errmsg);
    throw new PublicImageSecurityError("VISION_SECURITY_CHECK_FAILED", "图片安全审核暂时不可用，请稍后重试");
  }

  return {
    assertImageAllowed,
    prepareMediaForImgSecCheck: (buffer, contentType) =>
      prepareMediaForImgSecCheck(buffer, contentType, { sharpFactory }),
    getAccessToken,
  };
}

module.exports = {
  PublicImageSecurityError,
  createWechatImageSecurity,
  prepareMediaForImgSecCheck,
  MAX_SEC_BYTES,
  MAX_SEC_WIDTH,
  MAX_SEC_HEIGHT,
};
