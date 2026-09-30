import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { Image, Text, View } from "@tarojs/components";
import { chooseFoodImage } from "../../platform/food-media";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { getProductAccountUsage } from "../../api/product-data-api";
import {
  analyzeProductImage,
  readPendingVisionAnalysisId,
  resumeVisionAnalysis,
  VISION_CLIENT_TOTAL_BUDGET_MS,
} from "../../api/vision-api";
import { AppButton } from "../../components/app-button";
import { BottomSheet } from "../../components/bottom-sheet";
import { FirstRunTip } from "../../components/first-run-tip";
import { NordicIcon } from "../../components/nordic-icon";
import bowlImage from "../../assets/meal-bowl.svg";
import oatsImage from "../../assets/meal-oats.svg";
import salmonImage from "../../assets/meal-salmon.svg";
import { formatVisionUploadHint } from "../../features/media/image-upload-limits";
import { isVisionQuotaExhausted, visionDailyQuotaEnforced } from "../../features/scanner/vision-quota";
import {
  hasSeenFirstRunTip,
  markFirstRunTipSeen,
  retireFirstRunTipsIfRecordedMeals,
} from "../../features/first-run-tips/first-run-tips";
import { PageLayout } from "../../layouts/page-layout";
import { useAnalysisStore } from "../../stores/analysis-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
import { useScannerStore } from "../../stores/scanner-store";
import { feedbackVariantForError } from "../../features/feedback/feedback-error";

function shouldShowScannerTip(): boolean {
  const meals = useMealStore.getState();
  if (retireFirstRunTipsIfRecordedMeals(meals.meals, meals.dataSource)) return false;
  return !hasSeenFirstRunTip("scanner-capture");
}

const imageByKey = { bowl: bowlImage, oats: oatsImage, salmon: salmonImage };

function isUserCancelMediaChoice(error: unknown): boolean {
  const pieces = [
    typeof error === "string" ? error : "",
    error instanceof Error ? error.message : "",
    error && typeof error === "object" && "errMsg" in error
      ? String((error as { errMsg?: unknown }).errMsg ?? "")
      : "",
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "",
  ];
  const text = pieces.join(" ").toLowerCase();
  return text.includes("cancel") || text.includes("取消");
}

export default function FoodScannerPage() {
  useTranslation();
  const scanner = useScannerStore();
  const analysis = useAnalysisStore();
  const feedback = useFeedbackStore();
  const [isScanning, setIsScanning] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackKind, setFallbackKind] = useState<"generic" | "daily_limit">("generic");
  const [fallbackMessage, setFallbackMessage] = useState(() => t("scannerPage.fallback"));
  const [showScannerTip, setShowScannerTip] = useState(shouldShowScannerTip);
  const [visionRemaining, setVisionRemaining] = useState<number | null>(null);
  const isScanningRef = useRef(false);
  const pendingResumeRef = useRef(false);
  const suppressPreviewResetRef = useRef(false);
  const preview = scanner.capturedMeal ?? scanner.candidates[0] ?? null;
  const visionQuotaExhausted = isVisionQuotaExhausted(visionRemaining);

  const clearPreviewDisplay = () => {
    scanner.setPreviewPath(null);
    scanner.setGalleryMode(false);
  };

  const dismissScannerTip = () => {
    markFirstRunTipSeen("scanner-capture");
    setShowScannerTip(false);
  };

  useDidShow(() => {
    // Re-sync: tip key may be missing even when meals already prove first-run is done.
    if (!shouldShowScannerTip()) setShowScannerTip(false);
    // Returning from analysis/result should reset the frame; skip while a pick/analyze
    // session is active so chooseMedia onShow does not wipe the just-selected image.
    if (suppressPreviewResetRef.current || isScanningRef.current) return;
    clearPreviewDisplay();
    const pendingAnalysisId = readPendingVisionAnalysisId();
    if (!pendingAnalysisId || pendingResumeRef.current) return;
    pendingResumeRef.current = true;
    isScanningRef.current = true;
    setIsScanning(true);
    void resumeVisionAnalysis({
      onStatus: (status) => console.info("[vision] async status", {
        analysisId: status.analysisId,
        status: status.status,
        currentStage: status.currentStage,
      }),
    }).then((meal) => {
      if (!meal) return;
      scanner.setCapturedMeal(meal);
      analysis.setAnalysis(meal);
      scanner.markResultRevealPending();
      return Taro.navigateTo({ url: "/pages/analysis-result/index?reveal=1" });
    }).catch((error) => {
      if (error instanceof Error && error.name === "VISION_ASYNC_PROCESSING") return;
      console.warn("[vision] pending analysis recovery failed:", error);
    }).finally(() => {
      pendingResumeRef.current = false;
      isScanningRef.current = false;
      setIsScanning(false);
    });
  });

  useEffect(() => {
    void getProductAccountUsage()
      .then((usage) => setVisionRemaining(usage.vision.remaining))
      .catch(() => undefined);
  }, []);

  const refreshVisionUsage = async () => {
    try {
      const usage = await getProductAccountUsage();
      setVisionRemaining(usage.vision.remaining);
      return usage.vision.remaining;
    } catch {
      return null;
    }
  };

  const showVisionQuotaModal = () => {
    feedback.showModal({
      variant: "limit",
      title: t("scannerPage.scanLimit"),
      description: t("scannerPage.limitDescription"),
      primaryText: t("scannerPage.gotIt"),
      secondaryText: t("scannerPage.manual"),
      onSecondary: () => openManualMeal(),
      dismissible: true,
    });
  };

  const analyzeCurrentPreview = async (previewPath: string, recognitionStartedAt = Date.now(), mediaAcquisitionMs = 0, source: "camera" | "album" = "camera") => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsScanning(true);
    dismissScannerTip();
    try {
      let meal;
      try {
        const clientDeadlineAt = recognitionStartedAt + VISION_CLIENT_TOTAL_BUDGET_MS;
        meal = await analyzeProductImage(previewPath, {
          recognitionStartedAt,
          deadlineAt: clientDeadlineAt,
          source,
          onTiming: (event) => console.info("[vision] client timing", { ...event, media_acquisition_ms: mediaAcquisitionMs }),
        });
      } catch (error) {
        scanner.clearResultRevealPending();
        const errorName = error instanceof Error ? error.name : "";
        const isNotConfigured = errorName === "VISION_SERVICE_NOT_CONFIGURED";
        const isContentBlocked = errorName === "VISION_CONTENT_BLOCKED";
        const isNonFood = errorName === "VISION_NON_FOOD";
        const isVisionTimeout = errorName === "VISION_TIMEOUT";
        const isAsyncProcessing = errorName === "VISION_ASYNC_PROCESSING";
        const isVisionNetworkError = errorName === "VISION_NETWORK_ERROR";
        console.error("[vision] analyzeProductImage failed:", error);
        const visionRemainingAfterLimit = errorName === "RATE_LIMITED" ? await refreshVisionUsage() : null;
        const isDailyLimitReached = isVisionQuotaExhausted(visionRemainingAfterLimit);
        const userMessage = isDailyLimitReached
          ? t("scannerPage.limitLong")
          : isNotConfigured
          ? t("scannerPage.notConfigured")
          : isContentBlocked
            ? t("scannerPage.contentBlocked")
          : isNonFood
              ? t("scannerPage.nonFood")
              : isVisionTimeout
                ? t("scannerPage.timeout")
                : isAsyncProcessing
                  ? t("scannerPage.processing")
                : isVisionNetworkError
                  ? t("scannerPage.network")
              : error instanceof Error
                ? (/aborted|timeout|timed out|operation was aborted/i.test(error.message) ? t("scannerPage.timeout") : error.message)
                : t("scannerPage.failed");
        setFallbackKind(isDailyLimitReached ? "daily_limit" : "generic");
        setFallbackMessage(userMessage);
        feedback.showModal({
          variant: isDailyLimitReached ? "limit" : feedbackVariantForError(error),
          title: t(isDailyLimitReached ? "scannerPage.scanLimit" : "scannerPage.failedTitle"),
          description: isDailyLimitReached ? t("scannerPage.limitDescription") : userMessage,
          primaryText: t("scannerPage.gotIt"),
          secondaryText: t("scannerPage.manual"),
          onSecondary: () => openManualMeal(),
          dismissible: true,
        });
        setFallbackOpen(false);
        return;
      }
      scanner.setCapturedMeal(meal);
      analysis.setAnalysis(meal);
      console.info("[vision] client timing", { stage: "analysis_result_ready", client_total_ms: Date.now() - recognitionStartedAt, media_acquisition_ms: mediaAcquisitionMs });
      scanner.markResultRevealPending();
      try {
        await Taro.navigateTo({ url: "/pages/analysis-result/index?reveal=1" });
      } catch (error) {
        console.warn("[vision] result page navigation failed after successful analysis:", error);
      }
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
    }
  };

  const chooseImage = async (source: "camera" | "album") => {
    if (isScanningRef.current) return;
    if (visionQuotaExhausted) {
      showVisionQuotaModal();
      return;
    }
    suppressPreviewResetRef.current = true;
    try {
      const mediaAcquisitionStartedAt = Date.now();
      const previewPath = await chooseFoodImage(source);
      if (!previewPath) throw new Error("没有获取到图片");
      const recognitionStartedAt = Date.now();
      const mediaAcquisitionMs = recognitionStartedAt - mediaAcquisitionStartedAt;
      console.info("[vision] client timing", { stage: "media_acquisition", media_acquisition_ms: mediaAcquisitionMs });
      scanner.setPreviewPath(previewPath);
      scanner.setGalleryMode(source === "album");
      setFallbackKind("generic");
      setFallbackOpen(false);
      // Any successful capture path completes step 2 — not only the tip CTA.
      dismissScannerTip();
      await analyzeCurrentPreview(previewPath, recognitionStartedAt, mediaAcquisitionMs, source);
    } catch (error) {
      // User closed the album/camera without picking — stay on the page quietly.
      if (isUserCancelMediaChoice(error)) return;
      const message =
        error instanceof Error && error.message.includes("图片过大")
          ? error.message
          : t("scannerPage.openFailed");
      setFallbackMessage(message);
      feedback.showModal({
        variant: "error",
        title: t("scannerPage.openFailedTitle"),
        description: message,
        primaryText: t("scannerPage.gotIt"),
        secondaryText: t("scannerPage.manual"),
        onSecondary: () => openManualMeal(),
        dismissible: true,
      });
      setFallbackOpen(false);
    } finally {
      suppressPreviewResetRef.current = false;
    }
  };

  const retryChooseImage = () => {
    if (visionQuotaExhausted) {
      showVisionQuotaModal();
      return;
    }
    setFallbackOpen(false);
    void chooseImage("album");
  };

  const openManualMeal = () => {
    setFallbackOpen(false);
    dismissScannerTip();
    void Taro.navigateTo({ url: "/pages/manual-meal/index" });
  };

  return (
    <PageLayout
      activeTab="food-scanner"
      hideNavigation
      title={t("scannerPage.title")}
      className={`page-layout--food-scanner${process.env.TARO_APP_PLATFORM === "android" ? " page-layout--food-scanner-android" : ""}`}
    >
      <View className={`food-scanner-page${showScannerTip && !isScanning ? " food-scanner-page--with-tip" : ""}`}>
        <View className="food-scanner-page__header">
          <View className="food-scanner-page__heading">
            <Text className="food-scanner-page__title">{t("scannerPage.headline")}</Text>
            <Text className="food-scanner-page__subtitle">{t("scannerPage.subtitle")}</Text>
          </View>
          <View className="scanner-ai-status">
            <View className="scanner-ai-status__icon">
              <NordicIcon name="scan-line" size={22} ariaLabel={t("scannerPage.scanning")} />
            </View>
            <Text>{t("scannerPage.scanning")}</Text>
          </View>
        </View>

        {visionDailyQuotaEnforced && visionRemaining != null && visionRemaining <= 2 ? (
          <Text className="usage-quota-tip">
            {visionQuotaExhausted ? t("scannerPage.limitTomorrow") : t("scannerPage.remaining", { count: visionRemaining })}
          </Text>
        ) : null}

        {showScannerTip && !isScanning ? (
          <FirstRunTip
            tipId="scanner-capture"
            step="2/3"
            title={t("scannerPage.tipTitle")}
            body={t("scannerPage.tipBody")}
            actionLabel={t("scannerPage.takePhoto")}
            onAction={() => void chooseImage("camera")}
            onClose={() => setShowScannerTip(false)}
          />
        ) : null}

        <View
          className={`scanner-frame ${scanner.flashEnabled ? "scanner-frame--flash" : ""} ${isScanning ? "scanner-frame--scanning" : ""}`}
        >
          <View className="scanner-frame__corner scanner-frame__corner--tl" />
          <View className="scanner-frame__corner scanner-frame__corner--tr" />
          <View className="scanner-frame__corner scanner-frame__corner--bl" />
          <View className="scanner-frame__corner scanner-frame__corner--br" />
          <View className="scanner-frame__plate">
            {scanner.previewPath ? (
              <Image
                className="scanner-frame__preview"
                src={scanner.previewPath}
                mode="aspectFit"
              />
            ) : preview && scanner.galleryMode ? (
              <Image
                className="scanner-frame__preview"
                src={imageByKey[preview.imageKey]}
                mode="aspectFit"
              />
            ) : (
              <NordicIcon name="food-pot" size={56} ariaLabel={t("scannerPage.frameHint")} />
            )}
          </View>
          {isScanning ? (
            <View className="scanner-frame__analysis-overlay">
              <View className="scanner-frame__scan-line" />
              <View className="scanner-frame__analysis-copy">
                <NordicIcon name="scan-line" size={20} ariaLabel={t("scannerPage.scanningAria")} />
                <Text>{t("scannerPage.analyzingFood")}</Text>
              </View>
            </View>
          ) : null}
          <View className="scanner-frame__hint">
            <Text className="scanner-frame__hint-title">
              {t(scanner.previewPath ? "scannerPage.imageReady" : "scannerPage.naturalLight")}
            </Text>
            <Text>
              {t(scanner.previewPath ? "scannerPage.preparing" : "scannerPage.frameFood")}
            </Text>
          </View>
        </View>

        <View className="scanner-controls">
          <View
            className="scanner-control"
            ariaLabel={t("scannerPage.manual")}
            onClick={isScanning ? undefined : openManualMeal}
          >
            <NordicIcon name="circle-plus" size={20} ariaLabel={t("scannerPage.manual")} />
            <Text>{t("scannerPage.manual")}</Text>
          </View>
          <View
            className={`scanner-capture ${visionQuotaExhausted ? "scanner-capture--disabled" : ""}`}
            ariaLabel={t("scannerPage.cameraAria")}
            onClick={() => chooseImage("camera")}
          >
            <View className="scanner-capture__inner">
              <NordicIcon name="camera" size={30} ariaLabel={t("scannerPage.camera")} />
            </View>
          </View>
          <View
            className={`scanner-control ${scanner.galleryMode ? "scanner-control--active" : ""} ${visionQuotaExhausted ? "scanner-control--disabled" : ""}`}
            ariaLabel={t("scannerPage.galleryAria")}
            onClick={() => chooseImage("album")}
          >
            <NordicIcon name="images" size={20} ariaLabel={t("scannerPage.gallery")} />
            <Text>{t("scannerPage.gallery")}</Text>
          </View>
        </View>
        <View className="scanner-primary-action">
          <AppButton
            size="large"
            disabled={isScanning}
            visualDisabled={visionQuotaExhausted}
            onClick={() => void chooseImage("camera")}
          >
            {t(isScanning ? "scannerPage.analysisRunning" : visionQuotaExhausted ? "scannerPage.scanLimit" : "scannerPage.captureAnalyze")}
          </AppButton>
        </View>
        <Text className="scanner-upload-hint">{formatVisionUploadHint()}</Text>
      </View>
      <BottomSheet
        open={fallbackOpen}
        className="scanner-fallback-sheet"
        onDismiss={() => setFallbackOpen(false)}
      >
        <View className="scanner-fallback-sheet__content">
          <View className="scanner-fallback-sheet__header">
            <Text>{t(fallbackKind === "daily_limit" ? "scannerPage.scanLimit" : "scannerPage.openFailedTitle")}</Text>
            <View ariaLabel={t("common.close")} onClick={() => setFallbackOpen(false)}>
              <NordicIcon name="x" size={20} ariaLabel={t("common.close")} />
            </View>
          </View>
          <Text className="scanner-fallback-sheet__copy">{fallbackMessage}</Text>
          {fallbackKind === "daily_limit" ? null : (
            <AppButton size="medium" onClick={retryChooseImage}>
              {t("scannerPage.chooseAgain")}
            </AppButton>
          )}
          <AppButton variant={fallbackKind === "daily_limit" ? "primary" : "outline"} size="medium" onClick={openManualMeal}>
            {t(fallbackKind === "daily_limit" ? "scannerPage.manualMeal" : "scannerPage.manual")}
          </AppButton>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
