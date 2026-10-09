import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { getAchievementRequirement, getAchievementTranslationSlug } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import { AchievementConfettiCanvas, achievementConfettiDelayMs, type CelebrationModalSize } from "../achievement-confetti-canvas";
import { NordicIcon, type NordicIconName } from "../nordic-icon";

export interface AchievementUnlockModalAchievement {
  id?: string;
  title: string;
  description?: string;
  progress?: number;
  level?: string;
  icon?: NordicIconName;
  requirement?: string;
  unlocked?: boolean;
  target?: number;
  unit?: string;
  unlockedAt?: string | null;
  celebrationPending?: boolean;
}

export interface AchievementUnlockModalProps {
  achievement: AchievementUnlockModalAchievement | null;
  onDismiss: () => Promise<boolean>;
}

export function AchievementUnlockModal({ achievement, onDismiss }: AchievementUnlockModalProps) {
  const { t } = useTranslation();
  if (!achievement) return null;

  const celebrationCardId = `achievement-unlock-card-${(achievement.id || achievement.title).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const [celebrationModalSize, setCelebrationModalSize] = useState<CelebrationModalSize | null>(null);
  const slug = getAchievementTranslationSlug(achievement.title);
  const requirement = achievement.description || (slug ? t(`achievements.items.${slug}.requirement`) : achievement.requirement || getAchievementRequirement(achievement.title));
  const title = slug ? t(`achievements.items.${slug}.title`) : achievement.title;
  const icon = achievement.icon || getAchievementIcon({
    id: achievement.id || "",
    title: achievement.title,
  });
  const openAchievements = async () => {
    if (!await onDismiss()) return;
    void Taro.navigateTo({ url: "/pages/achievements/index" });
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      Taro.createSelectorQuery()
        .select(`#${celebrationCardId}`)
        .boundingClientRect()
        .exec((result) => {
          const card = result[0] as CelebrationModalSize | undefined;
          if (cancelled || !card?.width || !card.height) return;
          setCelebrationModalSize({ width: card.width, height: card.height });
        });
    }, achievementConfettiDelayMs * (process.env.TARO_APP_PLATFORM === "android" ? 2 : 1));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [celebrationCardId]);
  return (
    <View className={`achievement-unlock-overlay${process.env.TARO_APP_PLATFORM === "android" ? " achievement-unlock-overlay--android" : ""}`} ariaLabel={t("achievementUnlock.title")}>
      <View className="achievement-unlock-overlay__backdrop" onClick={() => { void onDismiss(); }} />
      <View className="achievement-unlock-overlay__group">
        <AchievementConfettiCanvas
          seed={achievement.id || achievement.title}
          modalSize={celebrationModalSize}
        />
        <View id={celebrationCardId} className="achievement-unlock-overlay__card">
        <View
          className="achievement-unlock-overlay__close"
          ariaLabel={t("achievementUnlock.close")}
          onClick={() => { void onDismiss(); }}
        >
          <NordicIcon name="x" size={22} ariaLabel={t("common.close")} />
        </View>
        <View className="achievement-unlock-overlay__icon">
          <NordicIcon name={icon} size={52} ariaLabel={title} />
          <View className="achievement-unlock-overlay__sparkle achievement-unlock-overlay__sparkle--top-right">
            <NordicIcon name="sparkles" size={20} ariaLabel={t("achievementUnlock.sparkle")} />
          </View>
          <View className="achievement-unlock-overlay__sparkle achievement-unlock-overlay__sparkle--bottom-left">
            <NordicIcon name="sparkles" size={18} ariaLabel={t("achievementUnlock.sparkle")} />
          </View>
        </View>
        <Text className="achievement-unlock-overlay__eyebrow">{t("achievementUnlock.title")}</Text>
        <Text className="achievement-unlock-overlay__title">{title}</Text>
        <Text className="achievement-unlock-overlay__copy">{requirement}</Text>
        <View className="achievement-unlock-overlay__primary-action" onClick={() => { void onDismiss(); }}>
          <Text>{t("achievementUnlock.accept")}</Text>
        </View>
        <View className="achievement-unlock-overlay__secondary-action" onClick={() => { void openAchievements(); }}>
          <Text>{t("achievementUnlock.viewAll")}</Text>
        </View>
        </View>
      </View>
    </View>
  );
}
