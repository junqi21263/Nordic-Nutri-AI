import assert from "node:assert/strict";
import test from "node:test";

import { PublicProfileAvatarError, createProfileAvatarService } from "./profile-avatar-service.cjs";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9jOsAAAAAASUVORK5CYII=";

test("stores a validated image beneath the authenticated user's avatar prefix and persists only the file id", async () => {
  const writes = [];
  const service = createProfileAvatarService({
    data: { saveAvatarPath: async (userId, path) => { writes.push({ userId, path }); return { avatar_path: path }; } },
    uploadImage: async ({ cloudPath, contentType, content }) => {
      assert.match(cloudPath, /^avatars\/user-1\/[a-f0-9-]+\.png$/);
      assert.equal(contentType, "image/png");
      assert.ok(Buffer.isBuffer(content));
      return { fileId: "cloud://env.avatars/user-1/avatar.png" };
    },
    createTemporaryUrl: async (fileId) => `https://temp.example/${fileId.split("/").pop()}`,
  });

  const result = await service.upload("user-1", { mimeType: "image/png", base64: PNG_BASE64 });

  assert.equal(writes[0].userId, "user-1");
  assert.equal(writes[0].path, "cloud://env.avatars/user-1/avatar.png");
  assert.equal(result.avatarUrl, "https://temp.example/avatar.png");
});

test("rejects a non-image payload before uploading it", async () => {
  const service = createProfileAvatarService({
    data: { saveAvatarPath: async () => ({}) },
    uploadImage: async () => { throw new Error("must not upload"); },
    createTemporaryUrl: async () => "https://temp.example/avatar.png",
  });

  await assert.rejects(
    () => service.upload("user-1", { mimeType: "image/png", base64: Buffer.from("not an image").toString("base64") }),
    (error) => error instanceof PublicProfileAvatarError && error.code === "AVATAR_IMAGE_INVALID",
  );
});
