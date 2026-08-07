import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getAchievementRequirement } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import type { Achievement } from "../../features/coach/domain";
import { NordicIcon } from "../nordic-icon";

const particleIndexes = Array.from({ length: 14 }, (_, index) => index);

export function AchievementUnlockOverlay({
  achievement,
  onDismiss,
}: {
  achievement: Achievement | null;
  onDismiss: () => Promise<boolean>;
}) {
  if (!achievement) return null;

  const requirement = achievement.requirement || getAchievementRequirement(achievement.title);
  const openAchievements = async () => {
    if (!await onDismiss()) return;
    void Taro.navigateTo({ url: "/pages/achievements/index" });
  };

  return (
    <View className="achievement-unlock-overlay" ariaLabel="成就已解锁">
      <View className="achievement-unlock-overlay__backdrop" onClick={() => { void onDismiss(); }} />
      <View className="achievement-unlock-overlay__confetti">
        {particleIndexes.map((index) => (
          <View
            key={index}
            className={`achievement-unlock-overlay__particle achievement-unlock-overlay__particle--${index}`}
          />
        ))}
      </View>
      <View className="achievement-unlock-overlay__card">
        <View className="achievement-unlock-overlay__icon">
          <NordicIcon name={getAchievementIcon(achievement)} size={34} ariaLabel={achievement.title} />
        </View>
        <Text className="achievement-unlock-overlay__eyebrow">成就已解锁</Text>
        <Text className="achievement-unlock-overlay__title">{achievement.title}</Text>
        <Text className="achievement-unlock-overlay__copy">{requirement}</Text>
        <View className="achievement-unlock-overlay__primary-action" onClick={() => { void onDismiss(); }}>
          <Text>收下这份成就</Text>
        </View>
        <Text className="achievement-unlock-overlay__secondary-action" onClick={() => { void openAchievements(); }}>
          查看全部成就
        </Text>
      </View>
    </View>
  );
}
