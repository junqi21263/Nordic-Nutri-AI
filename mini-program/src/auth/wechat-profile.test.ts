import { describe, expect, it } from "vitest";
import { readWechatProfile } from "./wechat-profile";

describe("readWechatProfile", () => {
  it("keeps the nickname and avatar supplied by the authorization response", () => {
    expect(
      readWechatProfile({
        userInfo: { nickName: "北欧小李", avatarUrl: "https://wx.qlogo.cn/avatar.jpg" },
      }),
    ).toEqual({ nickname: "北欧小李", avatarUrl: "https://wx.qlogo.cn/avatar.jpg" });
  });

  it("returns null instead of writing a blank nickname", () => {
    expect(
      readWechatProfile({
        userInfo: { nickName: "  ", avatarUrl: "https://wx.qlogo.cn/avatar.jpg" },
      }),
    ).toBeNull();
  });
});
