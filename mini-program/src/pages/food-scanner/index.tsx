import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { AppButton } from "../../components/app-button";
import { BottomSheet, bottomSheetExitDuration } from "../../components/bottom-sheet";
import { NordicIcon } from "../../components/nordic-icon";
import bowlImage from "../../assets/meal-bowl.svg";
import oatsImage from "../../assets/meal-oats.svg";
import salmonImage from "../../assets/meal-salmon.svg";
import { PageLayout } from "../../layouts/page-layout";
import { useAnalysisStore } from "../../stores/analysis-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useScannerStore } from "../../stores/scanner-store";
import { useTabBarStore } from "../../stores/tab-bar-store";

const imageByKey = { bowl: bowlImage, oats: oatsImage, salmon: salmonImage };

export default function FoodScannerPage() {
  const scanner = useScannerStore();
  const analysis = useAnalysisStore();
  const feedback = useFeedbackStore();
  const setTabBarVisible = useTabBarStore((state) => state.setVisible);
  const [isScanning, setIsScanning] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = scanner.capturedMeal ?? scanner.candidates[0] ?? null;

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (fallbackOpen) {
      setTabBarVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setTabBarVisible(true), bottomSheetExitDuration);
    return () => clearTimeout(timer);
  }, [fallbackOpen, setTabBarVisible]);

  useEffect(() => () => setTabBarVisible(true), [setTabBarVisible]);

  const analyzeCurrentPreview = () => {
    if (isScanning) return;
    const meal = scanner.captureRandom();
    analysis.setAnalysis(meal);
    setIsScanning(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      Taro.navigateTo({ url: "/pages/analysis-result/index" });
    }, 1600);
  };

  const chooseImage = async (source: "camera" | "album") => {
    if (isScanning) return;
    try {
      const result = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [source],
      });
      const previewPath = result.tempFiles[0]?.tempFilePath;
      if (!previewPath) throw new Error("没有获取到图片");
      scanner.setPreviewPath(previewPath);
      scanner.setGalleryMode(source === "album");
      analyzeCurrentPreview();
    } catch (error) {
      const message = String(error);
      if (message.includes("cancel")) {
        feedback.show({ message: "已取消选择图片", tone: "success" });
        return;
      }
      setFallbackOpen(true);
    }
  };

  const useExampleMeal = () => {
    setFallbackOpen(false);
    scanner.setPreviewPath(null);
    scanner.setGalleryMode(false);
    analyzeCurrentPreview();
  };

  const openManualMeal = () => {
    setFallbackOpen(false);
    void Taro.navigateTo({ url: "/pages/manual-meal/index" });
  };

  return (
    <PageLayout
      activeTab="food-scanner"
      hideNavigation
      title="食物扫描"
      className="page-layout--food-scanner"
    >
      <View className="food-scanner-page">
        <View className="food-scanner-page__page-title">
          <Text>食物扫描</Text>
        </View>
        <View className="food-scanner-page__header">
          <View className="food-scanner-page__heading">
            <Text className="food-scanner-page__title">记录这一餐</Text>
            <Text className="food-scanner-page__subtitle">对准餐盘，让每一口都有依据。</Text>
          </View>
          <View className="scanner-ai-status">
            <View className="scanner-ai-status__icon">
              <NordicIcon name="sparkles" size={22} ariaLabel="AI 识别中" />
            </View>
            <Text>AI 识别中</Text>
          </View>
        </View>

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
                mode="aspectFill"
              />
            ) : preview && scanner.galleryMode ? (
              <Image
                className="scanner-frame__preview"
                src={imageByKey[preview.imageKey]}
                mode="aspectFill"
              />
            ) : (
              <NordicIcon name="utensils" size={56} ariaLabel="餐盘取景提示" />
            )}
          </View>
          <View className="scanner-frame__mode-strip">
            <View className="scanner-frame__mode-item scanner-frame__mode-item--active">
              <NordicIcon name="camera" size={17} ariaLabel="原生相机" />
              <Text>原生相机</Text>
            </View>
            <View className="scanner-frame__mode-item">
              <NordicIcon name="images" size={17} ariaLabel="本地图库" />
              <Text>本地图库</Text>
            </View>
            <View className="scanner-frame__mode-item">
              <NordicIcon name="zap" size={17} ariaLabel="原生相机闪光控制" />
              <Text>相机内调节</Text>
            </View>
          </View>
          {isScanning ? (
            <View className="scanner-frame__analysis-overlay">
              <View className="scanner-frame__scan-line" />
              <View className="scanner-frame__analysis-copy">
                <NordicIcon name="scan-line" size={20} ariaLabel="正在扫描" />
                <Text>正在识别餐品与营养信息</Text>
              </View>
            </View>
          ) : null}
          <View className="scanner-frame__hint">
            <Text className="scanner-frame__hint-title">
              {scanner.previewPath ? "本地图片已就绪" : "自然光更清晰"}
            </Text>
            <Text>
              {scanner.previewPath ? "已选择图片，正在准备本地分析" : "将食物完整放入取景框"}
            </Text>
          </View>
        </View>

        <View className="scanner-controls">
          <View
            className="scanner-control"
            ariaLabel="手动记录"
            onClick={isScanning ? undefined : openManualMeal}
          >
            <NordicIcon name="circle-plus" size={20} ariaLabel="手动记录" />
            <Text>手动记录</Text>
          </View>
          <View
            className="scanner-capture"
            ariaLabel="拍摄并开始分析"
            onClick={() => chooseImage("camera")}
          >
            <View className="scanner-capture__inner">
              <NordicIcon name="camera" size={30} ariaLabel="拍摄" />
            </View>
          </View>
          <View
            className={`scanner-control ${scanner.galleryMode ? "scanner-control--active" : ""}`}
            ariaLabel="从图库选择图片"
            onClick={() => chooseImage("album")}
          >
            <NordicIcon name="images" size={20} ariaLabel="图库" />
            <Text>图库</Text>
          </View>
        </View>
        <View className="scanner-primary-action">
          <AppButton size="large" disabled={isScanning} onClick={() => chooseImage("camera")}>
            {isScanning ? "正在 AI 分析" : "拍摄并 AI 分析"}
          </AppButton>
        </View>
      </View>
      <BottomSheet
        open={fallbackOpen}
        className="scanner-fallback-sheet"
        onDismiss={() => setFallbackOpen(false)}
      >
        <View className="scanner-fallback-sheet__content">
          <View className="scanner-fallback-sheet__header">
            <Text>暂时无法打开图片</Text>
            <View ariaLabel="关闭" onClick={() => setFallbackOpen(false)}>
              <NordicIcon name="x" size={20} ariaLabel="关闭" />
            </View>
          </View>
          <Text className="scanner-fallback-sheet__copy">
            可检查相机或相册权限，也可以先使用示例餐盘继续体验。
          </Text>
          <AppButton size="medium" onClick={useExampleMeal}>
            使用示例餐盘继续
          </AppButton>
          <AppButton variant="outline" size="medium" onClick={openManualMeal}>
            手动记录
          </AppButton>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
