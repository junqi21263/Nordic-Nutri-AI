import { describe, expect, it, vi } from "vitest";
import { createAppUpdateCoordinator, selectUpdate } from "./coordinator";

describe("Android app update coordinator", () => {
  it("shows only releases newer than the installed version", () => {
    const release = { versionCode: 3, versionName: "1.2.0", releaseNotes: [] };
    expect(selectUpdate({ versionCode: 2 }, { update: release })).toEqual(release);
    expect(selectUpdate({ versionCode: 3 }, { update: release })).toBeNull();
    expect(selectUpdate({ versionCode: 4 }, { update: release })).toBeNull();
  });

  it("checks once and chooses the market channel for market installs", async () => {
    const getNativeInfo = vi.fn().mockResolvedValue({
      versionCode: 2,
      versionName: "1.1.0",
      installerPackage: "com.android.vending",
    });
    const fetchLatest = vi.fn().mockResolvedValue({ update: { versionCode: 3, versionName: "1.2.0", releaseNotes: [] } });
    const onUpdate = vi.fn();
    const coordinator = createAppUpdateCoordinator({ getNativeInfo, fetchLatest, onUpdate });

    await Promise.all([coordinator.check(), coordinator.check()]);

    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(fetchLatest).toHaveBeenCalledWith("market");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps Home usable when update lookup fails", async () => {
    const coordinator = createAppUpdateCoordinator({
      getNativeInfo: vi.fn().mockResolvedValue({ versionCode: 2, versionName: "1.1.0", installerPackage: null }),
      fetchLatest: vi.fn().mockRejectedValue(new Error("offline")),
      onUpdate: vi.fn(),
    });
    await expect(coordinator.check()).resolves.toBeUndefined();
  });
});
