import { Canvas } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo } from "react";
import brandLogoSource from "../../assets/brand/nordic-nutri-logo.png";
import miniProgramCodeSource from "../../assets/brand/miniprogram-code.jpg";
import { getMilestoneIllustrationAsset, MILESTONE_CONFIG } from "../../features/milestones/config";
import { resolveMilestoneIllustrationSource } from "../../features/milestones/asset-cache";
import { createTaroMilestoneIllustrationTransport } from "../../features/milestones/taro-asset-transport";
import { getMilestonePosterImageCandidates } from "./image-source";
import {
  getMilestonePosterImageRect,
  MILESTONE_POSTER_CANVAS_HEIGHT,
  MILESTONE_POSTER_CANVAS_WIDTH,
  MILESTONE_POSTER_FOOTER_COPY_TO_QR_GAP,
  MILESTONE_POSTER_FOOTER_HEIGHT,
  MILESTONE_POSTER_FOOTER_LOGO_SIZE,
  MILESTONE_POSTER_FOOTER_QR_SIZE,
  MILESTONE_POSTER_HERO_HEIGHT,
} from "./layout";
import { getMilestoneShareMessage, getMilestoneShareMetrics } from "../../features/milestones/share-presentation";
import { MILESTONES } from "../../features/milestones/stats";
import type { MilestonePosterProps } from "../milestone-poster";
import "./index.scss";

type CanvasNode = {
  width: number;
  height: number;
  createImage: () => {
    src: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    width: number;
    height: number;
  };
  getContext: (type: "2d") => CanvasRenderingContext2D;
};

type CanvasImage = ReturnType<CanvasNode["createImage"]>;

type FooterCanvasAssets = {
  logo: CanvasImage;
  miniProgramCode: CanvasImage;
};

export type MilestonePosterExporter = () => Promise<string>;

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const rows: string[] = [];
  let current = "";
  for (const character of text) {
    const next = current + character;
    if (current && context.measureText(next).width > maxWidth) {
      rows.push(current);
      current = character;
    } else current = next;
  }
  if (current) rows.push(current);
  return rows.slice(0, 2);
}

function drawImageClipped(
  context: CanvasRenderingContext2D,
  image: CanvasImage,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  context.save();
  context.beginPath();
  if (radius <= 0) {
    context.rect(x, y, size, size);
  } else {
    // Avoid Canvas 2D roundRect(), which is not available in older WeChat
    // base libraries. The manual path is supported by all target runtimes.
    const r = Math.min(radius, size / 2);
    context.moveTo(x + r, y);
    context.lineTo(x + size - r, y);
    context.quadraticCurveTo(x + size, y, x + size, y + r);
    context.lineTo(x + size, y + size - r);
    context.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
    context.lineTo(x + r, y + size);
    context.quadraticCurveTo(x, y + size, x, y + size - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }
  context.clip();
  context.drawImage(image as unknown as CanvasImageSource, x, y, size, size);
  context.restore();
}

/**
 * Canvas aligns glyphs on a font baseline, while serif digits can have a
 * different visible cap height from letters and symbols. Draw each glyph on
 * its visual centre so `3 DAYS` and values such as `85%` read as one level.
 */
function drawOpticallyCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  font: string,
  letterSpacing = 0,
) {
  context.font = font;
  const glyphs = [...text];
  const widths = glyphs.map((glyph) => context.measureText(glyph).width);
  const textWidth = widths.reduce((total, glyphWidth) => total + glyphWidth, 0)
    + Math.max(glyphs.length - 1, 0) * letterSpacing;
  let x = centerX - textWidth / 2;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  glyphs.forEach((glyph, index) => {
    const metrics = context.measureText(glyph);
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    const baseline = Number.isFinite(ascent) && Number.isFinite(descent)
      ? centerY + (ascent - descent) / 2
      : centerY;
    context.fillText(glyph, x, baseline);
    x += widths[index] + letterSpacing;
  });
  context.textAlign = "center";
}

function drawBrandFooter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding: number,
  assets: FooterCanvasAssets,
) {
  // This is one compact, right-aligned brand group: copy block on the left,
  // supplied mini-program QR at the far right. It deliberately avoids an
  // app-style logo block stranded on the left side of the poster.
  const footerHeight = MILESTONE_POSTER_FOOTER_HEIGHT;
  const footerTop = height - footerHeight;
  const qrSize = MILESTONE_POSTER_FOOTER_QR_SIZE;
  const qrX = width - padding - qrSize;
  const qrY = footerTop + (footerHeight - qrSize) / 2;
  const copyRight = qrX - MILESTONE_POSTER_FOOTER_COPY_TO_QR_GAP;
  const logoSize = MILESTONE_POSTER_FOOTER_LOGO_SIZE;
  const footerCenter = footerTop + footerHeight / 2;
  context.fillStyle = "#f1ebdf";
  context.fillRect(0, footerTop, width, height - footerTop);
  context.strokeStyle = "rgba(21,63,43,0.16)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(padding, footerTop);
  context.lineTo(width - padding, footerTop);
  context.stroke();

  context.textBaseline = "middle";
  context.textAlign = "right";
  context.fillStyle = "#153f2b";
  context.font = "600 42px sans-serif";
  const brandName = "Nordic Nutri AI";
  const brandNameWidth = context.measureText(brandName).width;
  drawImageClipped(
    context,
    assets.logo,
    copyRight - brandNameWidth - 14 - logoSize,
    footerCenter - 76,
    logoSize,
    logoSize / 2,
  );
  context.fillText(brandName, copyRight, footerCenter - 52);
  context.fillStyle = "#4d5750";
  context.font = "34px sans-serif";
  context.fillText("每一次记录，都算数", copyRight, footerCenter + 8);
  context.font = "28px sans-serif";
  context.fillText("扫码开始记录", copyRight, footerCenter + 56);
  // The supplied JPEG has a white quiet zone. Multiply blends that white into
  // the warm footer paper while retaining the dark modules needed for scanning.
  context.save();
  context.globalCompositeOperation = "multiply";
  drawImageClipped(context, assets.miniProgramCode, qrX, qrY, qrSize, 0);
  context.restore();
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
}

function drawPoster(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  props: MilestonePosterProps,
  image: { width: number; height: number },
  footerAssets: FooterCanvasAssets,
) {
  const config = MILESTONE_CONFIG[props.milestone];
  const shareMessage = getMilestoneShareMessage(props.milestone);
  const shareMetrics = getMilestoneShareMetrics(props);
  const heroHeight = MILESTONE_POSTER_HERO_HEIGHT;
  const padding = 76;
  const imageRect = getMilestonePosterImageRect(image.width, image.height);
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#fcfaf4");
  gradient.addColorStop(1, "#f1ebdf");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(0, 0, width, heroHeight);
  context.clip();
  context.drawImage(
    image as unknown as CanvasImageSource,
    imageRect.x,
    imageRect.y,
    imageRect.width,
    imageRect.height,
  );
  context.restore();
  context.fillStyle = "#faf9f4";
  context.fillRect(0, heroHeight, width, height - heroHeight);
  context.font = "600 32px sans-serif";
  context.fillStyle = "#153f2b";
  context.fillText(config.stageLabel, padding, heroHeight + 88);
  context.textAlign = "right";
  context.fillText(config.stageNumber, width - padding, heroHeight + 88);
  context.textAlign = "center";
  context.fillStyle = "#153f2b";
  context.font = "500 30px sans-serif";
  context.fillText(config.eyebrow, width / 2, heroHeight + 142);
  const titleCenter = heroHeight + 208;
  const titleText = `${props.milestone} DAYS`;
  drawOpticallyCenteredText(context, titleText, width / 2, titleCenter, "bold 88px Georgia", 2);
  context.textAlign = "center";
  context.fillStyle = "#4d5750";
  context.font = "34px sans-serif";
  const messageRows = wrapText(context, shareMessage, width - padding * 2);
  messageRows.forEach((row, index) =>
    context.fillText(row, width / 2, heroHeight + 330 + index * 46),
  );
  // Keep title, message, highlights, and journey in a continuous body. The
  // last journey label deliberately ends just before the compact footer.
  const metricsTop = heroHeight + 482;
  context.strokeStyle = "rgba(21,63,43,0.18)";
  context.beginPath();
  context.moveTo(padding, metricsTop - 32);
  context.lineTo(width - padding, metricsTop - 32);
  context.moveTo(padding, metricsTop + 108);
  context.lineTo(width - padding, metricsTop + 108);
  context.stroke();
  shareMetrics.forEach((metric, index) => {
    const column = width / Math.max(shareMetrics.length, 1);
    const x = column * (index + 0.5);
    if (index) {
      context.beginPath();
      context.moveTo(column * index, metricsTop - 14);
      context.lineTo(column * index, metricsTop + 90);
      context.stroke();
    }
    context.fillStyle = "#667168";
    context.font = "600 24px sans-serif";
    context.fillText(metric.label, x, metricsTop - 4);
    context.fillStyle = "#153f2b";
    drawOpticallyCenteredText(context, metric.value, x, metricsTop + 56, "bold 48px Georgia");
  });
  const journeyTop = metricsTop + 192;
  context.strokeStyle = "#a4aea6";
  context.beginPath();
  context.moveTo(padding + 20, journeyTop);
  context.lineTo(width - padding - 20, journeyTop);
  context.stroke();
  MILESTONES.forEach((milestone, index) => {
    const x = padding + 20 + ((width - padding * 2 - 40) / (MILESTONES.length - 1)) * index;
    context.beginPath();
    const active = props.progressState
      ? props.progressState.some((item) => item.milestone === milestone && item.active)
      : milestone <= props.milestone;
    context.fillStyle = active ? "#153f2b" : "#fcfaf4";
    context.arc(x, journeyTop, 12, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#153f2b";
    context.stroke();
    context.fillStyle = "#153f2b";
    context.font = "26px sans-serif";
    context.fillText(String(milestone), x, journeyTop + 42);
  });
  drawBrandFooter(context, width, height, padding, footerAssets);
}

function loadCanvasImage(
  canvas: CanvasNode,
  source: string,
): Promise<CanvasImage> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image as never);
    image.onerror = () => reject(new Error(`资源读取失败：${source}`));
    image.src = source;
  });
}

export function MilestonePosterCanvas({
  poster,
  onReady,
}: {
  poster: MilestonePosterProps;
  onReady: (exporter: MilestonePosterExporter) => void;
}) {
  const canvasId = useMemo(() => `milestone-poster-${poster.milestone}`, [poster.milestone]);

  useEffect(() => {
    let disposed = false;
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((result) => {
        const entry = result[0];
        const canvas = entry?.node as CanvasNode | undefined;
        if (disposed || !canvas) return;
        const width = MILESTONE_POSTER_CANVAS_WIDTH;
        const height = MILESTONE_POSTER_CANVAS_HEIGHT;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const image = canvas.createImage();
        const defaultAsset = getMilestoneIllustrationAsset(poster.milestone);
        const asset = poster.illustration ? {
          id: poster.illustrationAsset?.id ?? `inline-${poster.milestone}`,
          localSource: poster.illustration,
          version: poster.illustrationAsset?.version ?? "inline",
        } : poster.illustrationAsset ?? {
          id: `inline-${poster.milestone}`,
          localSource: poster.illustration ?? defaultAsset.localSource,
          version: "inline",
        };
        void resolveMilestoneIllustrationSource(asset, createTaroMilestoneIllustrationTransport()).then((resolvedSource) => {
          if (disposed) return;
          const imageCandidates = getMilestonePosterImageCandidates(resolvedSource);
          let imageAttempt = 0;
          image.onload = () => {
            if (disposed) return;
            void Promise.all([
              loadCanvasImage(canvas, brandLogoSource),
              loadCanvasImage(canvas, miniProgramCodeSource),
            ]).then(([logo, miniProgramCode]) => {
              if (disposed) return;
              drawPoster(context, width, height, poster, image, { logo, miniProgramCode });
              onReady(async () => {
                const result = await Taro.canvasToTempFilePath({
                  canvas: canvas as never,
                  fileType: "png",
                  width,
                  height,
                  destWidth: width,
                  destHeight: height,
                } as never);
                if (!result.tempFilePath) throw new Error("分享卡生成失败，请稍后重试");
                return result.tempFilePath;
              });
            }).catch(() => {
              if (disposed) return;
              onReady(async () => {
                throw new Error("品牌资源读取失败，请稍后重试");
              });
            });
          };
          image.onerror = () => {
            if (disposed) return;
            imageAttempt += 1;
            const nextSource = imageCandidates[imageAttempt];
            if (nextSource) {
              image.src = nextSource;
              return;
            }
            onReady(async () => {
              throw new Error("插画读取失败，请稍后重试");
            });
          };
          image.src = imageCandidates[0] ?? "";
        });
      });
    return () => {
      disposed = true;
    };
  }, [canvasId, onReady, poster]);

  return <Canvas id={canvasId} canvasId={canvasId} className="milestone-poster-canvas" type="2d" />;
}
