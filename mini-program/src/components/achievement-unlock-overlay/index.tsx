import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getAchievementRequirement } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import type { Achievement } from "../../features/coach/domain";
import { NordicIcon } from "../nordic-icon";

const particleIndexes = [0, 1, 2, 3, 4, 5];

export function AchievementUnlockOverlay({
  achievement,
  achievements,
  onDismiss,
}: {
  achievement: Achievement | null;
  achievements: Achievement[];
  onDismiss: () => Promise<boolean>;
}) {
  if (!achievement) return null;

  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const requirement = achievement.requirement || getAchievementRequirement(achievement.title);
  const openAchievements = async () => {
    if (!await onDismiss()) return;
    void Taro.navigateTo({ url: "/pages/achievements/index" });
  };

  return (
    <View className="achievement-unlock-overlay" ariaLabel="成就已解锁">
      <View className="achievement-unlock-overlay__backdrop" onClick={() => { void onDismiss(); }} />
      <View className="achievement-unlock-overlay__card">
        {particleIndexes.map((index) => (
          <View
            key={index}
            className={`achievement-unlock-overlay__particle achievement-unlock-overlay__particle--${index}`}
          />
        ))}
        <View className="achievement-unlock-overlay__icon">
          <NordicIcon name={getAchievementIcon(achievement)} size={34} ariaLabel={achievement.title} />
        </View>
        <Text className="achievement-unlock-overlay__eyebrow">成就已解锁</Text>
        <Text className="achievement-unlock-overlay__title">{achievement.title}</Text>
        <Text className="achievement-unlock-overlay__copy">{requirement}</Text>
        <View className="achievement-unlock-overlay__progress">
          <View className="achievement-unlock-overlay__progress-copy">
            <Text>成长里程</Text>
            <Text>{unlockedCount} / {achievements.length}</Text>
          </View>
          <View className="achievement-unlock-overlay__progress-track">
            <View
              className="achievement-unlock-overlay__progress-fill"
              style={{ width: `${achievements.length ? (unlockedCount / achievements.length) * 100 : 0}%` }}
            />
          </View>
        </View>
        <View className="achievement-unlock-overlay__primary-action" onClick={() => { void onDismiss(); }}>
          <Text>继续记录</Text>
        </View>
        <Text className="achievement-unlock-overlay__secondary-action" onClick={() => { void openAchievements(); }}>
          查看成长里程
        </Text>
      </View>
    </View>
  );
}
