const crypto = require("node:crypto");

const MAX_AVATAR_BYTES = 1_500_000;
const MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

class PublicProfileAvatarError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function hasMatchingImageSignature(content, mimeType) {
  if (!Buffer.isBuffer(content) || !content.length) return false;
  if (mimeType === "image/png") return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255;
  if (mimeType === "image/webp") return content.length >= 12 && content.subarray(0, 4).toString("ascii") === "RIFF" && content.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function parseAvatarInput(input) {
  const mimeType = typeof input?.mimeType === "string" ? input.mimeType.toLowerCase() : "";
  const base64 = typeof input?.base64 === "string" ? input.base64.trim() : "";
  if (!MIME_TO_EXTENSION[mimeType] || !base64 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64)) throw new PublicProfileAvatarError("AVATAR_IMAGE_INVALID");
  const content = Buffer.from(base64, "base64");
  if (!content.length || content.length > MAX_AVATAR_BYTES || !hasMatchingImageSignature(content, mimeType)) throw new PublicProfileAvatarError("AVATAR_IMAGE_INVALID");
  return { content, mimeType, extension: MIME_TO_EXTENSION[mimeType] };
}

function createProfileAvatarService({ data, uploadImage, createTemporaryUrl }) {
  if (!data || typeof data.saveAvatarPath !== "function" || typeof uploadImage !== "function" || typeof createTemporaryUrl !== "function") {
    throw new Error("Profile avatar service is unavailable");
  }
  return {
    async upload(userId, input) {
      const image = parseAvatarInput(input);
      const cloudPath = `avatars/${userId}/${crypto.randomUUID()}.${image.extension}`;
      const uploaded = await uploadImage({ cloudPath, contentType: image.mimeType, content: image.content });
      const fileId = typeof uploaded?.fileId === "string" ? uploaded.fileId : "";
      if (!fileId) throw new Error("Avatar storage upload failed");
      await data.saveAvatarPath(userId, fileId);
      const avatarUrl = await createTemporaryUrl(fileId);
      if (!avatarUrl) throw new Error("Avatar temporary URL failed");
      return { avatarUrl };
    },
  };
}

module.exports = { MAX_AVATAR_BYTES, PublicProfileAvatarError, createProfileAvatarService, parseAvatarInput };
