import { describe, expect, it } from "vitest";
import {
  FALLBACK_AVATAR_SRC,
  resolveAvatarUrl,
} from "../src/features/profile/avatar-defaults";

describe("resolveAvatarUrl", () => {
  it("maps default robot sentinels to bundled assets", () => {
    expect(resolveAvatarUrl("default:robot-1")).toBeTruthy();
    expect(resolveAvatarUrl("default:robot-1")).not.toBe("default:robot-1");
    expect(resolveAvatarUrl("default:robot-99")).toBe(FALLBACK_AVATAR_SRC);
  });

  it("falls back to a robot for empty or unusable storage refs", () => {
    expect(resolveAvatarUrl(null)).toBe(FALLBACK_AVATAR_SRC);
    expect(resolveAvatarUrl("")).toBe(FALLBACK_AVATAR_SRC);
    expect(resolveAvatarUrl("cloud://env.avatars/broken.png")).toBe(FALLBACK_AVATAR_SRC);
    expect(resolveAvatarUrl("pgstore:avatars/broken.png")).toBe(FALLBACK_AVATAR_SRC);
  });

  it("keeps displayable remote and inline urls", () => {
    expect(resolveAvatarUrl("https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");
    expect(resolveAvatarUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
