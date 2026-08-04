import assert from "node:assert/strict";
import test from "node:test";

import { createProfileAvatarService, parseAvatarInput } from "./profile-avatar-service.cjs";

// Minimal valid 1x1 PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("parseAvatarInput accepts a tiny PNG", () => {
  const parsed = parseAvatarInput({ mimeType: "image/png", base64: PNG_BASE64 });
  assert.equal(parsed.mimeType, "image/png");
  assert.ok(Buffer.isBuffer(parsed.content));
});

test("upload falls back to data URL when cloud storage fails", async () => {
  let savedPath = "";
  const service = createProfileAvatarService({
    data: {
      saveAvatarPath: async (_userId, avatarPath) => {
        savedPath = avatarPath;
        return { id: _userId, avatar_path: avatarPath };
      },
    },
    uploadImage: async () => {
      throw new Error("Avatar storage upload failed: INVALID_ACCESS_TOKEN");
    },
    createTemporaryUrl: async () => null,
  });

  const result = await service.upload("user-1", { mimeType: "image/png", base64: PNG_BASE64 });
  assert.match(result.avatarUrl, /^data:image\/png;base64,/);
  assert.equal(savedPath, result.avatarUrl);
});

test("upload does not persist unresolvable storage refs", async () => {
  let savedPath = "";
  const service = createProfileAvatarService({
    data: {
      saveAvatarPath: async (_userId, avatarPath) => {
        savedPath = avatarPath;
        return { id: _userId, avatar_path: avatarPath };
      },
    },
    uploadImage: async () => ({ fileId: "pgstore:avatars/broken.png" }),
    createTemporaryUrl: async () => null,
  });

  const result = await service.upload("user-1", { mimeType: "image/png", base64: PNG_BASE64 });
  assert.match(result.avatarUrl, /^data:image\/png;base64,/);
  assert.match(savedPath, /^data:image\/png;base64,/);
  assert.doesNotMatch(savedPath, /^pgstore:/);
});

test("upload accepts a bundled default avatar sentinel", async () => {
  let savedPath = "";
  const service = createProfileAvatarService({
    data: {
      saveAvatarPath: async (_userId, avatarPath) => {
        savedPath = avatarPath;
        return { id: _userId, avatar_path: avatarPath };
      },
    },
    uploadImage: async () => {
      throw new Error("should not upload");
    },
    createTemporaryUrl: async () => null,
  });

  const result = await service.upload("user-1", { defaultAvatar: "default:food-3" });
  assert.equal(result.avatarUrl, "default:food-3");
  assert.equal(savedPath, "default:food-3");
});

test("upload rejects an unknown default avatar sentinel", async () => {
  const service = createProfileAvatarService({
    data: {
      saveAvatarPath: async () => ({ id: "user-1" }),
    },
    uploadImage: async () => ({ fileId: "unused" }),
    createTemporaryUrl: async () => null,
  });

  await assert.rejects(
    () => service.upload("user-1", { defaultAvatar: "default:food-99" }),
    (error) => error?.code === "AVATAR_IMAGE_INVALID",
  );
});
