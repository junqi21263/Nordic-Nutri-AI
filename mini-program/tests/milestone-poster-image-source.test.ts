import { describe, expect, it } from "vitest";
import {
  getMilestonePosterImageCandidates,
  resolveMilestonePosterImageSource,
} from "../src/components/milestone-poster-canvas/image-source";

describe("milestone poster canvas image source", () => {
  it("uses the device-local path returned by getImageInfo for packaged assets", async () => {
    const source = "/assets/images/milestones/start-wellness.jpg";
    const resolved = await resolveMilestonePosterImageSource(source, async () => ({
      path: "wxfile://tmp/milestone-start-wellness.jpg",
    }));

    expect(resolved).toBe("wxfile://tmp/milestone-start-wellness.jpg");
  });

  it("tries the page-relative package path before the page resolves assets under /pages", async () => {
    const attempted: string[] = [];
    const resolved = await resolveMilestonePosterImageSource(
      "/assets/images/milestones/start-wellness.jpg",
      async ({ src }) => {
        attempted.push(src);
        if (src === "../../assets/images/milestones/start-wellness.jpg") {
          return { path: "wxfile://tmp/milestone-start-wellness.jpg" };
        }
        throw new Error("not found");
      },
    );

    expect(attempted[0]).toBe("../../assets/images/milestones/start-wellness.jpg");
    expect(resolved).toBe("wxfile://tmp/milestone-start-wellness.jpg");
  });

  it("exposes direct Canvas candidates in page-relative order", () => {
    expect(getMilestonePosterImageCandidates("/assets/images/milestones/start-wellness.jpg")).toEqual([
      "../../assets/images/milestones/start-wellness.jpg",
      "/assets/images/milestones/start-wellness.jpg",
      "assets/images/milestones/start-wellness.jpg",
    ]);
  });
});
