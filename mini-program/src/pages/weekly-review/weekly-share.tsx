import { useTranslation } from "react-i18next";
import { getLocale, t } from "../../i18n";
import { Canvas, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import type { ProductWeeklyReview } from "../../api/insight-api";
import { AppButton } from "../../components/app-button";
import { Loading } from "../../components/loading";
import { MilestoneSharePreview } from "../../components/milestone-share-preview";
import { Modal } from "../../components/modal";
import { weeklyShareLines } from "./share-content";
import { drawWeeklySharePoster } from "./weekly-share-poster";
import { exportPosterCanvas } from "../../components/milestone-poster-canvas/export";
import "../../components/milestone-poster-canvas/index.scss";
import { WEEKLY_POSTER_HEIGHT, WEEKLY_POSTER_WIDTH } from "./weekly-share-poster";
import brandLogoSource from "../../assets/brand/nordic-nutri-logo.png";
import weeklyIllustrationSource from "../../assets/weekly/nordic-weekly-illustration.jpg";
import { useSystemLayout } from "../../hooks/useSystemLayout";
import {
  chooseDifferentIllustrationIndex,
  getWeeklyIllustrationIndex,
  weeklyIllustrationStorageKey,
  weeklyIllustrationUrls,
  WEEKLY_ILLUSTRATION_COUNT,
} from "./share-content";

export function WeeklyShare({
  review,
  streak,
  onClose,
}: {
  review: ProductWeeklyReview;
  streak: number | null;
  onClose: () => void;
}) {
  useTranslation();
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [illustrationIndex, setIllustrationIndex] = useState(() => {
    const key = weeklyIllustrationStorageKey(review.startDate);
    try {
      return getWeeklyIllustrationIndex(review.startDate, { [key]: Taro.getStorageSync(key) });
    } catch {
      return getWeeklyIllustrationIndex(review.startDate, {});
    }
  });
  const saving = useRef(false);
  const layout = useSystemLayout();
  useEffect(() => {
    let active = true;
    // Use the existing Taro Canvas -> PNG pipeline, without remote image dependencies.
    Taro.nextTick(() => {
      void (async () => {
        if (!active) return;
        // Raw 2D keeps font changes ordered; Taro H5's legacy draw queue does not.
        const canvas =
          process.env.TARO_ENV === "h5"
            ? document.querySelector<HTMLCanvasElement>('canvas[canvas-id="weekly-share-canvas"]')
            : await new Promise<HTMLCanvasElement | null>((resolve) =>
                Taro.createSelectorQuery()
                  .select("#weekly-share-canvas")
                  .fields({ node: true })
                  .exec((result) => resolve(result[0]?.node ?? null)),
              );
        if (!active) return;
        if (!canvas) throw new Error("canvas unavailable");
        canvas.width = WEEKLY_POSTER_WIDTH;
        canvas.height = WEEKLY_POSTER_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas context unavailable");
        const lines = weeklyShareLines(review, streak);
        const canvasNode = canvas as HTMLCanvasElement & { createImage?: () => HTMLImageElement };
        const loadImage = async (source: string): Promise<CanvasImageSource | undefined> => {
          try {
            const isH5 = process.env.TARO_ENV === "h5";
            const imageInfo = isH5 ? undefined : await Taro.getImageInfo({ src: source });
            const image = isH5 ? new Image() : canvasNode.createImage?.();
            if (!image) return undefined;
            return await new Promise<HTMLImageElement>((resolve, reject) => {
              image.onload = () => resolve(image);
              image.onerror = () => reject(new Error("poster image unavailable"));
              if (isH5 && /^https?:\/\//.test(source)) image.crossOrigin = "anonymous";
              image.src = imageInfo?.path ?? source;
            });
          } catch {
            return undefined;
          }
        };
        const illustrationUrl = weeklyIllustrationUrls(
          process.env.TARO_APP_MILESTONE_ASSET_CDN ?? "",
        )[illustrationIndex];
        const illustration =
          (illustrationUrl ? await loadImage(illustrationUrl) : undefined) ??
          (await loadImage(weeklyIllustrationSource));
        const brandLogo = await loadImage(brandLogoSource);
        drawWeeklySharePoster(ctx, {
          period: lines[1],
          recordedDays: review.recordedDays,
          recordedMeals: review.recordedMeals,
          proteinCompletion:
            review.recordedDays >= 3 ? review.averageCompletion?.protein ?? null : null,
          longestStreak: review.longestRecordedStreak ?? null,
          highlightTitle: review.insight.headline || t("share.highlight"),
          highlightCopy: review.insight.summary,
          nextGoal: review.insight.nextSteps[0] || t("weekly.nextStepFallback"),
          seriesLabel: lines[8],
          footerTagline: lines[6],
        }, illustration, brandLogo);
        const exported = await exportPosterCanvas(canvas, WEEKLY_POSTER_WIDTH, WEEKLY_POSTER_HEIGHT);
        if (active) {
          setPath(exported);
          setBusy(false);
        }
      })().catch(() => {
        if (active) {
          setError(t("common.requestFailed"));
          setBusy(false);
        }
      });
    });
    return () => {
      active = false;
    };
  }, [review, streak, illustrationIndex, getLocale()]);
  const refreshIllustration = () => {
    const nextIndex = chooseDifferentIllustrationIndex(illustrationIndex, WEEKLY_ILLUSTRATION_COUNT);
    try {
      Taro.setStorageSync(weeklyIllustrationStorageKey(review.startDate), nextIndex);
    } catch {
      void Taro.showToast({ title: t("share.illustrationNotSaved"), icon: "none" });
    }
    setBusy(true);
    setIllustrationIndex(nextIndex);
  };
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const bridge =
        typeof window !== "undefined"
          ? (window as unknown as { NordicPoster?: { savePng: (data: string) => string } })
              .NordicPoster
          : undefined;
      if (bridge && path.startsWith("data:image/png;base64,")) {
        const result = JSON.parse(bridge.savePng(path)) as { ok: boolean };
        if (!result.ok) throw new Error("save failed");
      } else if (process.env.TARO_ENV === "h5") {
        const anchor = document.createElement("a");
        anchor.href = path;
        anchor.download = "Nordic-Weekly.png";
        anchor.click();
      } else await Taro.saveImageToPhotosAlbum({ filePath: path });
      void Taro.showToast({
        title: process.env.TARO_ENV === "h5" && !bridge ? t("share.downloaded") : t("share.saved"),
        icon: "none",
      });
    } catch {
      void Taro.showToast({ title: t("share.saveFailed"), icon: "none" });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const share = () => {
    if (busy) return;
    try {
      const bridge =
        typeof window !== "undefined"
          ? (window as unknown as { NordicPoster?: { sharePng: (data: string) => string } })
              .NordicPoster
          : undefined;
      if (bridge && path.startsWith("data:image/png;base64,")) {
        const result = JSON.parse(bridge.sharePng(path)) as { ok: boolean };
        if (!result.ok) throw new Error("share failed");
        return;
      }
      void Taro.showToast({ title: t("share.shareHint"), icon: "none" });
    } catch {
      void Taro.showToast({ title: t("share.shareFailed"), icon: "none" });
    }
  };
  return (
    <>
      <Canvas
        type="2d"
        canvasId="weekly-share-canvas"
        id="weekly-share-canvas"
        className="milestone-poster-canvas"
        style={{ width: `${WEEKLY_POSTER_WIDTH}px`, height: `${WEEKLY_POSTER_HEIGHT}px` }}
      />
      {path ? (
        <MilestoneSharePreview
          path={path}
          busy={busy}
          topOffset={layout.totalHeaderHeight}
          aspectRatio={WEEKLY_POSTER_WIDTH / WEEKLY_POSTER_HEIGHT}
          onClose={onClose}
          onShare={share}
          onSave={() => void save()}
          onRefreshIllustration={refreshIllustration}
          showHint={false}
          title={t("share.title")}
        />
      ) : (
        <Modal open className="weekly-share__loading-modal" onBackdropClick={onClose}>
          <View className="weekly-share__loading-content">
            {error ? (
              <Text className="weekly-share__loading-error">{error}</Text>
            ) : (
              <Loading label={t("share.generating")} />
            )}
            <AppButton variant="ghost" size="small" onClick={onClose}>
              {t("common.close")}</AppButton>
          </View>
        </Modal>
      )}
    </>
  );
}
