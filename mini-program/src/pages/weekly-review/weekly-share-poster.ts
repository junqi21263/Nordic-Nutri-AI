/** Only share-safe weekly values and a curated illustration enter the poster. */
import { t } from "../../i18n";
export interface WeeklyPosterData {
  period: string;
  recordedDays: number;
  recordedMeals: number;
  proteinCompletion: number | null;
  longestStreak: number | null;
  highlightTitle: string;
  highlightCopy: string;
  nextGoal: string;
  seriesLabel: string;
  footerTagline: string;
}

export const WEEKLY_POSTER_WIDTH = 720;
export const WEEKLY_POSTER_HEIGHT = 1500;

const INK = "#1c3f32";
const SAGE = "#6c7d73";
const PAPER = "#f9faf7";
const CARD = "#ffffff";
const WASH = "#f3f4f1";
const MINT = "#e8f0eb";

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  roundedPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color = INK) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export function wrapPosterText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of value) {
    if (line && ctx.measureText(line + char).width > maxWidth) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
        lines[maxLines - 1] = `${last}…`;
        return lines;
      }
    } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}

function drawLeafMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#426557";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 17);
  ctx.bezierCurveTo(0, -8, 25, -12, 30, -8);
  ctx.bezierCurveTo(30, 12, 14, 26, 0, 17);
  ctx.moveTo(1, 17);
  ctx.lineTo(22, -2);
  ctx.stroke();
  ctx.restore();
}

function drawIllustrationPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, "#edf1ec");
  gradient.addColorStop(1, "#e1e8e2");
  box(ctx, x, y, w, h, 20, gradient as unknown as string);
  ctx.save();
  roundedPath(ctx, x, y, w, h, 20);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.36)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.76, y + h * 0.22, w * 0.23, h * 0.45, -0.55, 0, Math.PI * 2);
  ctx.fill();
  drawLeafMark(ctx, x + w * 0.48, y + h * 0.35);
  ctx.restore();
}

export function drawWeeklySharePoster(
  ctx: CanvasRenderingContext2D,
  data: WeeklyPosterData,
  heroIllustration?: CanvasImageSource,
  brandLogoImage?: CanvasImageSource,
) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WEEKLY_POSTER_WIDTH, WEEKLY_POSTER_HEIGHT);
  box(ctx, 24, 24, 672, 1452, 34, CARD);

  // Editorial header from the Stitch card: quiet title, dates, then a wide food illustration.
  ctx.font = "600 15px sans-serif";
  wrapPosterText(ctx, data.seriesLabel, 480, 1).forEach((line) => text(ctx, line, 66, 50, "600 15px sans-serif", SAGE));
  text(ctx, "Nordic Weekly", 64, 104, "italic 52px Georgia, 'Times New Roman', serif");
  text(ctx, data.period, 66, 144, "22px sans-serif", "#414844");
  ctx.fillStyle = MINT;
  ctx.beginPath();
  ctx.arc(626, 94, 36, 0, Math.PI * 2);
  ctx.fill();
  if (brandLogoImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(626, 94, 36, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(brandLogoImage, 590, 58, 72, 72);
    ctx.restore();
  }

  const hero = { x: 64, y: 174, w: 592, h: 294 };
  if (heroIllustration) {
    ctx.save();
    roundedPath(ctx, hero.x, hero.y, hero.w, hero.h, 20);
    ctx.clip();
    const image = heroIllustration as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
    const width = image.naturalWidth || image.width || hero.w;
    const height = image.naturalHeight || image.height || hero.h;
    const scale = Math.max(hero.w / width, hero.h / height);
    const cropW = hero.w / scale;
    const cropH = hero.h / scale;
    ctx.drawImage(heroIllustration, (width - cropW) / 2, (height - cropH) / 2, cropW, cropH, hero.x, hero.y, hero.w, hero.h);
    ctx.fillStyle = "rgba(3, 41, 29, 0.42)";
    ctx.fillRect(hero.x, hero.y + hero.h - 54, hero.w, 54);
    text(ctx, t("share.moments"), hero.x + 18, hero.y + hero.h - 20, "600 16px sans-serif", "#ffffff");
    ctx.restore();
  } else {
    drawIllustrationPlaceholder(ctx, hero.x, hero.y, hero.w, hero.h);
    text(ctx, t("share.moments"), hero.x + 18, hero.y + hero.h - 20, "600 16px sans-serif", SAGE);
  }

  const left = 64;
  const top = 492;
  const gap = 16;
  const cellW = 288;
  const cellH = 184;
  const stat = (x: number, y: number, label: string, value: string, suffix = "", fill = WASH, progress?: number) => {
    box(ctx, x, y, cellW, cellH, 20, fill);
    ctx.font = "600 19px sans-serif";
    wrapPosterText(ctx, label, cellW - 40, 1).forEach((line) => text(ctx, line, x + 20, y + 34, "600 19px sans-serif", "#414844"));
    ctx.font = "20px sans-serif";
    const suffixWidth = suffix ? ctx.measureText(suffix).width : 0;
    ctx.font = "42px Georgia, serif";
    const valueLine = wrapPosterText(ctx, value, cellW - 46 - suffixWidth, 1)[0] || "—";
    text(ctx, valueLine, x + 20, y + 105, "42px Georgia, serif");
    if (suffix) text(ctx, suffix, x + 26 + ctx.measureText(valueLine).width, y + 105, "20px sans-serif", SAGE);
    if (progress !== undefined) {
      box(ctx, x + 20, y + 145, cellW - 40, 7, 4, "#e2e3e0");
      box(ctx, x + 20, y + 145, Math.max(0, (cellW - 40) * Math.min(1, Math.max(0, progress))), 7, 4, "#426557");
    }
  };
  stat(left, top, t("share.recordedDays"), String(data.recordedDays), t("share.daysOutOfSeven"), WASH, data.recordedDays / 7);
  stat(left + cellW + gap, top, t("share.recordedMeals"), String(data.recordedMeals), t("share.mealsUnit"));
  stat(left, top + cellH + gap, t("share.protein"), data.proteinCompletion == null ? "—" : String(data.proteinCompletion), data.proteinCompletion == null ? "" : "%", WASH, data.proteinCompletion == null ? undefined : data.proteinCompletion / 100);
  stat(left + cellW + gap, top + cellH + gap, t("share.longestStreak"), data.longestStreak == null ? "—" : String(data.longestStreak), data.longestStreak == null ? "" : t("share.daysUnit"));

  const insightY = top + cellH * 2 + gap + 16;
  box(ctx, 64, insightY, 592, 204, 20, MINT);
  drawLeafMark(ctx, 84, insightY + 31);
  ctx.font = "600 23px sans-serif";
  wrapPosterText(ctx, data.highlightTitle || t("share.highlight"), 500, 1).forEach((line) => text(ctx, line, 128, insightY + 48, "600 23px sans-serif"));
  ctx.font = "20px sans-serif";
  wrapPosterText(ctx, data.highlightCopy, 520, 3).forEach((line, index) => text(ctx, line, 128, insightY + 92 + index * 31, "20px sans-serif", "#414844"));

  const goalY = insightY + 224;
  box(ctx, 64, goalY, 592, 204, 20, WASH);
  text(ctx, t("share.nextGoal"), 84, goalY + 42, "600 18px sans-serif", "#414844");
  text(ctx, "↗", 612, goalY + 40, "24px sans-serif", SAGE);
  ctx.beginPath();
  ctx.arc(91, goalY + 83, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#426557";
  ctx.fill();
  ctx.font = "22px sans-serif";
  wrapPosterText(ctx, data.nextGoal, 520, 3).forEach((line, index) => text(ctx, line, 108, goalY + 92 + index * 34, "22px sans-serif"));

  const footerY = goalY + 226;
  box(ctx, 64, footerY, 592, 110, 20, "#f3f4f1");
  text(ctx, "Nordic", 84, footerY + 45, "32px Georgia, serif");
  text(ctx, t("share.brandSubtitle"), 192, footerY + 43, "17px sans-serif", "#414844");
  ctx.font = "15px sans-serif";
  wrapPosterText(ctx, data.footerTagline, 548, 1).forEach((line) => text(ctx, line, 84, footerY + 76, "15px sans-serif", SAGE));
}
