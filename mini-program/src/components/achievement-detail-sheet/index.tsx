import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { BottomSheet } from "../../components/bottom-sheet";
import {
  formatAchievementUnlockedAt,
  getAchievementNextAction,
  getAchievementNextActionTarget,
  getAchievementRequirement,
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
  const metricLabel = achievement
    ? `${achievement.metric ?? Math.round(((achievement.progress || 0) / 100) * (achievement.target || 100))}/${achievement.target ?? "—"}${achievement.unit || ""}`
    : "";
  const canRecordNextMeal = Boolean(achievement && !achievement.unlocked && achievement.available !== false);
  const nextActionLabel = getAchievementNextAction(achievement?.title ?? "", Number(achievement?.metric ?? 0));
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
            <NordicIcon name={getAchievementIcon(achievement)} size={28} ariaLabel={achievement.title} />
          </View>
          <Text className="achievement-detail__title">{achievement.title}</Text>
          <Text className={`achievement-detail__state ${achievement.unlocked ? "achievement-detail__state--done" : ""}`}>
            {achievement.available === false ? "即将上线" : achievement.unlocked ? "已解锁" : "未解锁"}
          </Text>

          <View className="achievement-detail__card">
            <Text className="achievement-detail__label">{achievement.unlocked ? "达成时间" : "解锁目标"}</Text>
            <Text className="achievement-detail__value">
              {achievement.unlocked
                ? formatAchievementUnlockedAt(achievement.unlockedAt)
                : achievement.requirement || getAchievementRequirement(achievement.title)}
            </Text>
          </View>

          {achievement.available !== false ? (
            <View className="achievement-detail__card">
              <Text className="achievement-detail__label">当前进度</Text>
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
            轻触空白处关闭
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}
