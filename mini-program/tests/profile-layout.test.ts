import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = () => readFileSync(resolve(import.meta.dirname, "../src/pages/profile/android-profile.scss"), "utf8");
const overview = () => readFileSync(resolve(import.meta.dirname, "../src/pages/profile/android-overview.tsx"), "utf8");
const profilePage = () => readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");

describe("Android profile Stitch layout", () => {
  it("keeps daily and achievement actions on the section heading row", () => {
    const source = styles();
    expect(source).toContain("taro-button-core { display: inline-flex; align-items: center; justify-content: flex-end; width: auto; min-height: 32PX;");
    expect(source).toContain(".profile-stitch__daily .profile-stitch__section-head { flex-wrap: nowrap;");
    expect(source).toContain(".profile-stitch__achievements .profile-stitch__section-head { flex-wrap: nowrap;");
    expect(source).toContain(".profile-stitch__achievements .profile-stitch__section-head > taro-button-core { flex: 0 0 auto;");
  });

  it("uses the Stitch card surfaces instead of a tinted protein card", () => {
    const source = styles();
    expect(source).toContain(".profile-stitch__overview taro-button-core.profile-stitch__card { border: 1PX solid var(--profile-border); border-radius: 16PX; overflow: hidden;");
    expect(source).toContain("taro-button-core.profile-stitch__calories { padding: 14PX; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; background: #fff;");
    expect(source).toContain("taro-button-core.profile-stitch__protein { padding: 12PX; flex: 1; width: 100%; background: #fff;");
    expect(source).toContain(".profile-stitch__mini-stats { display: flex; border-radius: 16PX; background: #f6f3ed;");
  });

  it("removes the header gear while retaining the motion preference in the settings list", () => {
    expect(overview()).not.toContain("profile-stitch__motion-toggle");
    expect(profilePage()).not.toContain('open={activeModal === "settings"}');
    expect(profilePage()).toContain("页面动效");
  });

  it("keeps the journey action inside the journal card and aligns the status dot to the avatar edge", () => {
    const source = styles();
    expect(source).toContain(".profile-stitch__journal { padding: 16PX 16PX 0;");
    expect(source).toContain("min-height: 36PX;");
    expect(source).toContain("width: 18PX; height: 18PX;");
    expect(source).toContain("right: -3PX; bottom: -3PX;");
    expect(source).toContain("@keyframes profile-stitch-status-pulse");
  });
});
