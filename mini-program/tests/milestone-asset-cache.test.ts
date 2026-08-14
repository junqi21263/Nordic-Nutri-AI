import { describe, expect, it } from "vitest";
import {
  createMilestoneIllustrationCacheKey,
  resolveMilestoneIllustrationSource,
  type MilestoneIllustrationTransport,
} from "../src/features/milestones/asset-cache";

describe("milestone illustration cache", () => {
  const remoteAsset = {
    id: "start-wellness",
    remoteSource: "https://cdn.example.com/milestones/start-wellness.jpg",
    version: "v1",
  };

  it("uses the packaged illustration without touching the network when no remote asset is configured", async () => {
    const transport: MilestoneIllustrationTransport = {
      getFileInfo: async () => ({ size: 1 }),
      downloadFile: async () => ({ statusCode: 200, tempFilePath: "wxfile://should-not-download" }),
      saveFile: async () => ({ savedFilePath: "wxfile://should-not-save" }),
      getCachedPath: () => null,
      setCachedPath: () => undefined,
    };

    const source = await resolveMilestoneIllustrationSource(
      {
        id: "start-wellness",
        localSource: "/assets/images/milestones/start-wellness.jpg",
        version: "v1",
      },
      transport,
    );

    expect(source).toBe("/assets/images/milestones/start-wellness.jpg");
  });

  it("reuses a valid cached path before downloading a remote illustration", async () => {
    let downloads = 0;
    const transport: MilestoneIllustrationTransport = {
      getFileInfo: async ({ filePath }) => {
        if (filePath === "wxfile://cached/start-wellness.jpg") return { size: 123 };
        throw new Error("missing");
      },
      downloadFile: async () => {
        downloads += 1;
        return { statusCode: 200, tempFilePath: "wxfile://downloaded.jpg" };
      },
      saveFile: async () => ({ savedFilePath: "wxfile://saved.jpg" }),
      getCachedPath: () => "wxfile://cached/start-wellness.jpg",
      setCachedPath: () => undefined,
    };

    const source = await resolveMilestoneIllustrationSource(
      {
        id: "start-wellness",
        localSource: "/assets/images/milestones/start-wellness.jpg",
        remoteSource: "https://cdn.example.com/milestones/start-wellness.jpg",
        version: "v1",
      },
      transport,
    );

    expect(source).toBe("wxfile://cached/start-wellness.jpg");
    expect(downloads).toBe(0);
  });

  it("downloads, persists, and caches a remote illustration, falling back locally on failure", async () => {
    const saved: string[] = [];
    const transport: MilestoneIllustrationTransport = {
      getFileInfo: async () => {
        throw new Error("cache miss");
      },
      downloadFile: async () => ({ statusCode: 200, tempFilePath: "wxfile://tmp/start-wellness.jpg" }),
      saveFile: async ({ tempFilePath }) => ({ savedFilePath: `wxfile://saved/${tempFilePath.split("/").pop()}` }),
      getCachedPath: () => null,
      setCachedPath: (key, path) => saved.push(`${key}:${path}`),
    };

    const source = await resolveMilestoneIllustrationSource(
      {
        id: "start-wellness",
        localSource: "/assets/images/milestones/start-wellness.jpg",
        remoteSource: "https://cdn.example.com/milestones/start-wellness.jpg",
        version: "v1",
      },
      transport,
    );

    expect(source).toBe("wxfile://saved/start-wellness.jpg");
    expect(saved[0]).toBe(`${createMilestoneIllustrationCacheKey("start-wellness", "v1")}:wxfile://saved/start-wellness.jpg`);
  });

  it("never lets a remote failure remove the packaged fallback", async () => {
    const source = await resolveMilestoneIllustrationSource(
      {
        id: "start-wellness",
        localSource: "/assets/images/milestones/start-wellness.jpg",
        remoteSource: "https://cdn.example.com/milestones/start-wellness.jpg",
        version: "v1",
      },
      {
        getFileInfo: async () => {
          throw new Error("offline");
        },
        downloadFile: async () => {
          throw new Error("offline");
        },
        saveFile: async () => ({ savedFilePath: "" }),
        getCachedPath: () => null,
        setCachedPath: () => undefined,
      },
    );

    expect(source).toBe("/assets/images/milestones/start-wellness.jpg");
  });

  it("surfaces a production CDN failure when no local fallback is allowed", async () => {
    await expect(
      resolveMilestoneIllustrationSource(
        {
          id: "start-wellness",
          remoteSource: "https://cdn.example.com/milestones/start-wellness.jpg",
          version: "v1",
        },
        {
          getFileInfo: async () => {
            throw new Error("cache miss");
          },
          downloadFile: async () => ({ statusCode: 500 }),
          saveFile: async () => ({ savedFilePath: "" }),
          getCachedPath: () => null,
          setCachedPath: () => undefined,
        },
      ),
    ).rejects.toThrow("正式里程碑插画下载失败");
  });

  it("keeps different illustration versions in separate cache entries", () => {
    expect(createMilestoneIllustrationCacheKey("balance-a", "v1"))
      .not.toBe(createMilestoneIllustrationCacheKey("balance-a", "v2"));
  });

  it("removes an invalid cache record before downloading a replacement", async () => {
    const removed: string[] = [];
    const writes: string[] = [];
    const source = await resolveMilestoneIllustrationSource(remoteAsset, {
      getFileInfo: async () => { throw new Error("missing file"); },
      downloadFile: async () => ({ statusCode: 200, tempFilePath: "wxfile://tmp/fresh.jpg" }),
      saveFile: async () => ({ savedFilePath: "wxfile://saved/fresh.jpg" }),
      getCachedPath: () => "wxfile://saved/stale.jpg",
      setCachedPath: (key, path) => writes.push(`${key}:${path}`),
      removeCachedPath: (key) => removed.push(key),
    });

    const key = createMilestoneIllustrationCacheKey("start-wellness", "v1");
    expect(source).toBe("wxfile://saved/fresh.jpg");
    expect(removed).toEqual([key]);
    expect(writes).toEqual([`${key}:wxfile://saved/fresh.jpg`]);
  });

  it("does not retain a bad cache record when replacement download fails", async () => {
    const removed: string[] = [];
    await expect(resolveMilestoneIllustrationSource(remoteAsset, {
      getFileInfo: async () => ({ size: 0 }),
      downloadFile: async () => ({ statusCode: 500 }),
      saveFile: async () => ({ savedFilePath: "wxfile://should-not-save" }),
      getCachedPath: () => "wxfile://saved/stale.jpg",
      setCachedPath: () => { throw new Error("must not cache failure"); },
      removeCachedPath: (key) => removed.push(key),
    })).rejects.toThrow("正式里程碑插画下载失败");
    expect(removed).toEqual([createMilestoneIllustrationCacheKey("start-wellness", "v1")]);
  });

  it("does not create a persistent cache record when saving fails", async () => {
    let writes = 0;
    const source = await resolveMilestoneIllustrationSource(remoteAsset, {
      getFileInfo: async () => { throw new Error("cache miss"); },
      downloadFile: async () => ({ statusCode: 200, tempFilePath: "wxfile://tmp/session.jpg" }),
      saveFile: async () => { throw new Error("storage full"); },
      getCachedPath: () => null,
      setCachedPath: () => { writes += 1; },
      removeCachedPath: () => undefined,
    });
    expect(source).toBe("wxfile://tmp/session.jpg");
    expect(writes).toBe(0);
  });

  it("deduplicates concurrent downloads for the same id and version", async () => {
    let downloads = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const transport = {
      getFileInfo: async () => { throw new Error("cache miss"); },
      downloadFile: async () => {
        downloads += 1;
        await pending;
        return { statusCode: 200, tempFilePath: "wxfile://tmp/shared.jpg" };
      },
      saveFile: async () => ({ savedFilePath: "wxfile://saved/shared.jpg" }),
      getCachedPath: () => null,
      setCachedPath: () => undefined,
      removeCachedPath: () => undefined,
    } satisfies MilestoneIllustrationTransport;
    const first = resolveMilestoneIllustrationSource(remoteAsset, transport);
    const second = resolveMilestoneIllustrationSource(remoteAsset, transport);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      "wxfile://saved/shared.jpg",
      "wxfile://saved/shared.jpg",
    ]);
    expect(downloads).toBe(1);
  });

  it("releases a failed in-flight request so a later retry can download", async () => {
    let attempts = 0;
    const transport = {
      getFileInfo: async () => { throw new Error("cache miss"); },
      downloadFile: async () => {
        attempts += 1;
        return attempts === 1
          ? { statusCode: 500 }
          : { statusCode: 200, tempFilePath: "wxfile://tmp/retry.jpg" };
      },
      saveFile: async () => ({ savedFilePath: "wxfile://saved/retry.jpg" }),
      getCachedPath: () => null,
      setCachedPath: () => undefined,
      removeCachedPath: () => undefined,
    } satisfies MilestoneIllustrationTransport;
    await expect(resolveMilestoneIllustrationSource(remoteAsset, transport)).rejects.toThrow("正式里程碑插画下载失败");
    await expect(resolveMilestoneIllustrationSource(remoteAsset, transport)).resolves.toBe("wxfile://saved/retry.jpg");
    expect(attempts).toBe(2);
  });
});
