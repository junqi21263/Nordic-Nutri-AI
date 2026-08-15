import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AppCard } from "../app-card";
import { NordicIcon } from "../nordic-icon";
import type { DailyTargets } from "../../features/meals/domain";
import { hasValidMealImage } from "./logic";

interface MealDetailHeroProps {
  imageUrl?: string | null;
  nutrition: DailyTargets;
  score: string;
  scoreLabel: string;
  scoreSummary: string;
  onScorePress: () => void;
}

function ScoreBadge({ score, label, onScorePress }: Pick<MealDetailHeroProps, "score" | "onScorePress"> & { label: string }) {
  return (
    <View className="meal-detail-page__score-badge" ariaLabel="查看本餐评分依据" onClick={onScorePress}>
      <View className="meal-detail-page__score-grade">
        <Text>{score}</Text>
      </View>
      <Text className="meal-detail-page__score-badge-label">{label}</Text>
    </View>
  );
}

function MacroValue({ value, dataPoint }: { value: number; dataPoint?: boolean }) {
  if (!dataPoint) return <Text className="meal-detail-page__hero-macro-value">{value}g</Text>;
  return (
    <View className="meal-detail-page__hero-macro-value meal-detail-page__hero-macro-value--data">
      <View className="meal-detail-page__hero-macro-dot" />
      <Text>{value}g</Text>
    </View>
  );
}

function HeroMacros({ nutrition, dataPoint = false }: Pick<MealDetailHeroProps, "nutrition"> & { dataPoint?: boolean }) {
  return (
    <View className="meal-detail-page__hero-macros">
      <View className="meal-detail-page__hero-macro-chip">
        <MacroValue value={nutrition.protein} dataPoint={dataPoint} />
        <Text className="meal-detail-page__hero-macro-label">蛋白质</Text>
      </View>
      <View className="meal-detail-page__hero-macro-chip">
        <MacroValue value={nutrition.carbs} dataPoint={dataPoint} />
        <Text className="meal-detail-page__hero-macro-label">碳水</Text>
      </View>
      <View className="meal-detail-page__hero-macro-chip">
        <MacroValue value={nutrition.fat} dataPoint={dataPoint} />
        <Text className="meal-detail-page__hero-macro-label">脂肪</Text>
      </View>
    </View>
  );
}

function MealRatingSummary({ scoreSummary, onScorePress }: Pick<MealDetailHeroProps, "scoreSummary" | "onScorePress">) {
  return (
    <View className="meal-detail-page__score-footer" ariaLabel="查看本餐评分依据" onClick={onScorePress}>
      <View className="meal-detail-page__score-footer-copy">
        <Text className="meal-detail-page__score-footer-eyebrow">本餐评分</Text>
        <Text className="meal-detail-page__score-footer-summary">{scoreSummary}</Text>
      </View>
      <View className="meal-detail-page__score-footer-action">
        <Text>依据</Text>
        <NordicIcon name="chevron-right" size={16} ariaLabel="查看本餐评分依据" />
      </View>
    </View>
  );
}

export function MealDetailHero({
  imageUrl,
  nutrition,
  score,
  scoreLabel,
  scoreSummary,
  onScorePress,
}: MealDetailHeroProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);

  const showPhotoHero = hasValidMealImage(imageUrl) && !imageFailed;
  const previewImage = () => {
    if (!imageUrl) return;
    void Taro.previewImage({ current: imageUrl, urls: [imageUrl] });
  };

  if (showPhotoHero) {
    return (
      <AppCard tone="beige" className="meal-detail-page__hero meal-detail-page__hero--photo">
        <View className="meal-detail-page__hero-visual">
          <View className="meal-detail-page__hero-image-hit" ariaLabel="查看原始餐食照片" onClick={previewImage}>
            <Image
              className="meal-detail-page__hero-image"
              mode="aspectFill"
              src={imageUrl!}
              onError={() => setImageFailed(true)}
            />
          </View>
          <ScoreBadge score={score} label={scoreLabel} onScorePress={onScorePress} />
          <View className="meal-detail-page__image-preview-hint" ariaLabel="查看原始餐食照片" onClick={previewImage}>
            <Text>查看原图</Text>
          </View>
        </View>
        <View className="meal-detail-page__hero-body">
          <Text className="meal-detail-page__calories">{nutrition.calories}<Text>kcal</Text></Text>
          <HeroMacros nutrition={nutrition} />
        </View>
        <MealRatingSummary scoreSummary={scoreSummary} onScorePress={onScorePress} />
      </AppCard>
    );
  }

  return (
    <AppCard tone="beige" className="meal-detail-page__hero meal-detail-page__hero--data">
      <View className="meal-detail-page__data-hero-main">
        <ScoreBadge score={score} label={scoreLabel} onScorePress={onScorePress} />
        <View className="meal-detail-page__data-hero-arc" />
        <View className="meal-detail-page__data-hero-calories">
          <Text className="meal-detail-page__data-hero-calories-value">{nutrition.calories}</Text>
          <Text className="meal-detail-page__data-hero-calories-unit">千卡</Text>
        </View>
        <HeroMacros nutrition={nutrition} dataPoint />
      </View>
      <MealRatingSummary scoreSummary={scoreSummary} onScorePress={onScorePress} />
    </AppCard>
  );
}
