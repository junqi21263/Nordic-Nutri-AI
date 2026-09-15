import Taro from "@tarojs/taro";

export async function chooseFoodImage(source?: "camera" | "album"): Promise<string> {
  if (process.env.TARO_APP_PLATFORM === "android") {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        source: source === "camera" ? CameraSource.Camera : source === "album" ? CameraSource.Photos : CameraSource.Prompt,
        resultType: CameraResultType.Uri,
        quality: 85,
        width: 1920,
        height: 1920,
        correctOrientation: true,
        saveToGallery: false,
        promptLabelHeader: "选择图片",
        promptLabelPhoto: "从相册选择",
        promptLabelPicture: "拍照",
        promptLabelCancel: "取消",
      });
      if (!photo.webPath) throw new Error("没有获取到图片");
      return photo.webPath;
    }
  }
  const result = await Taro.chooseMedia({ count: 1, mediaType: ["image"], sourceType: source ? [source] : ["album", "camera"], sizeType: ["compressed"] });
  const path = result.tempFiles[0]?.tempFilePath;
  if (!path) throw new Error("没有获取到图片");
  return path;
}

export async function readWebImage(path: string): Promise<Blob> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("图片读取失败，请重新选择");
  return response.blob();
}

export async function readWebImageBase64(path: string): Promise<string> {
  const blob = await readWebImage(path);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
      : reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

export async function compressWebImage(path: string, quality: number, maxWidth = 1920): Promise<string> {
  const image = new Image();
  image.src = path;
  await image.decode();
  const scale = Math.min(1, maxWidth / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("图片压缩不可用");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality / 100);
}
