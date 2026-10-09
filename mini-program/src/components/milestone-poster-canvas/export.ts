import Taro from "@tarojs/taro";

/** One PNG export path for milestone and weekly posters. */
export async function exportPosterCanvas(
  canvas: { toDataURL?: (type: string) => string },
  width: number,
  height: number,
): Promise<string> {
  const path =
    typeof canvas.toDataURL === "function"
      ? canvas.toDataURL("image/png")
      : (
          await Taro.canvasToTempFilePath({
            canvas: canvas as never,
            fileType: "png",
            width,
            height,
            destWidth: width,
            destHeight: height,
          } as never)
        ).tempFilePath;
  if (!path) throw new Error("分享卡生成失败，请稍后重试");
  return path;
}
