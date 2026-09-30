import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import Taro from "@tarojs/taro";
import { BottomSheet } from "../../components/bottom-sheet";
import {
  formatAchievementUnlockedAt,
  getAchievementNextAction,
  getAchievementNextActionTarget,
  getAchievementRequirement,
  getAchievementTranslationSlug,
} from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import type { Achievement } from "../../features/coach/domain";
import { NordicIcon } from "../../components/nordic-icon";

interface AchievementDetailSheetProps {
  achievement: Achievement | null;
  onDismiss: () => void;
}

const isAndroidApp = process.env.TARO_APP_PLATFORM === "android";

export function AchievementDetailSheet({ achievement, onDismiss }: AchievementDetailSheetProps) {
  const { t } = useTranslation();
  const slug = achievement ? getAchievementTranslationSlug(achievement.title) : undefined;
  const metricLabel = achievement
    ? `${achievement.metric ?? Math.round(((achievement.progress || 0) / 100) * (achievement.target || 100))}/${achievement.target ?? "—"}${achievement.unit || ""}`
    : "";
  const canRecordNextMeal = Boolean(achievement && !achievement.unlocked && achievement.available !== false);
  const nextActionLabel = slug
    ? t(`achievements.items.${slug}.action`)
    : getAchievementNextAction(achievement?.title ?? "", Number(achievement?.metric ?? 0));
  const performNextAction = () => {
    onDismiss();
    const target = getAchievementNextActionTarget(achievement?.title ?? "");
    if (target === "/pages/meal-records/index") {
      void Taro.switchTab({ url: target });
      return;
    }
    void Taro.navigateTo({ url: target });
  };

  return (
    <BottomSheet
      open={Boolean(achievement)}
      onDismiss={onDismiss}
      className={`achievement-detail-sheet${isAndroidApp ? " achievement-detail-sheet--android" : ""}`}
      lockScroll
    >
      {achievement ? (
        <View className="achievement-detail">
          <View className={`achievement-detail__badge ${achievement.unlocked ? "" : "achievement-detail__badge--locked"}`}>
            <NordicIcon name={getAchievementIcon(achievement)} size={28} ariaLabel={slug ? t(`achievements.items.${slug}.title`) : achievement.title} />
          </View>
          <Text className="achievement-detail__title">{slug ? t(`achievements.items.${slug}.title`) : achievement.title}</Text>
          <Text className={`achievement-detail__state ${achievement.unlocked ? "achievement-detail__state--done" : ""}`}>
            {achievement.available === false ? t("achievementDetail.upcoming") : achievement.unlocked ? t("achievementDetail.unlocked") : t("achievementDetail.locked")}
          </Text>

          <View className="achievement-detail__card">
            <Text className="achievement-detail__label">{achievement.unlocked ? t("achievementDetail.achievedAt") : t("achievementDetail.unlockGoal")}</Text>
            <Text className="achievement-detail__value">
              {achievement.unlocked
                ? formatAchievementUnlockedAt(achievement.unlockedAt).replace(/ 达成$/, ` ${t("achievementDetail.achievedSuffix")}`).replace("已根据云端记录解锁", t("achievementDetail.unlockedFromCloud"))
                : slug ? t(`achievements.items.${slug}.requirement`) : achievement.requirement || getAchievementRequirement(achievement.title)}
            </Text>
          </View>

          {achievement.available !== false ? (
            <View className="achievement-detail__card">
              <Text className="achievement-detail__label">{t("achievementDetail.progress")}</Text>
              <Text className="achievement-detail__value">{metricLabel}</Text>
              <View className="achievement-detail__bar">
                <View
                  className="achievement-detail__bar-fill"
                  style={{ width: `${Math.min(100, achievement.progress || 0)}%` }}
                />
              </View>
            </View>
          ) : null}

          {canRecordNextMeal ? (
            <View className="achievement-detail__next-action" onClick={performNextAction}>
              <Text>{nextActionLabel}</Text>
              <NordicIcon name="chevron-right" size={16} ariaLabel={nextActionLabel} />
            </View>
          ) : null}

          <Text className="achievement-detail__hint" onClick={onDismiss}>
            {t("achievementDetail.dismissHint")}
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}
