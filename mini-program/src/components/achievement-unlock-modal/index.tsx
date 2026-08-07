import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getAchievementRequirement } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import { AchievementConfettiCanvas } from "../achievement-confetti-canvas";
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
  if (!achievement) return null;

  const requirement = achievement.description || achievement.requirement || getAchievementRequirement(achievement.title);
  const icon = achievement.icon || getAchievementIcon({
    id: achievement.id || "",
    title: achievement.title,
  });
  const openAchievements = async () => {
    if (!await onDismiss()) return;
    void Taro.navigateTo({ url: "/pages/achievements/index" });
  };
  return (
    <View className="achievement-unlock-overlay" ariaLabel="成就已解锁">
      <View className="achievement-unlock-overlay__backdrop" onClick={() => { void onDismiss(); }} />
      <View className="achievement-unlock-overlay__card">
        <View
          className="achievement-unlock-overlay__close"
          ariaLabel="关闭成就弹窗"
          onClick={() => { void onDismiss(); }}
        >
          <NordicIcon name="x" size={22} ariaLabel="关闭" />
        </View>
        <View className="achievement-unlock-overlay__icon">
          <NordicIcon name={icon} size={52} ariaLabel={achievement.title} />
          <View className="achievement-unlock-overlay__sparkle achievement-unlock-overlay__sparkle--top-right">
            <NordicIcon name="sparkles" size={20} ariaLabel="解锁闪光" />
          </View>
          <View className="achievement-unlock-overlay__sparkle achievement-unlock-overlay__sparkle--bottom-left">
            <NordicIcon name="sparkles" size={18} ariaLabel="解锁闪光" />
          </View>
        </View>
        <Text className="achievement-unlock-overlay__eyebrow">成就已解锁</Text>
        <Text className="achievement-unlock-overlay__title">{achievement.title}</Text>
        <Text className="achievement-unlock-overlay__copy">{requirement}</Text>
        <View className="achievement-unlock-overlay__primary-action" onClick={() => { void onDismiss(); }}>
          <Text>收下这份成就</Text>
        </View>
        <View className="achievement-unlock-overlay__secondary-action" onClick={() => { void openAchievements(); }}>
          <Text>查看全部成就</Text>
        </View>
      </View>
      <AchievementConfettiCanvas seed={achievement.id || achievement.title} />
    </View>
  );
}
