import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getAchievementRequirement } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import { NordicIcon } from "../nordic-icon";
import { useAchievementStore } from "../../stores/achievement-store";
import { acknowledgeProductAchievementCelebration } from "../../api/insight-api";

const particleIndexes = [0, 1, 2, 3, 4, 5];

export function AchievementUnlockOverlay() {
  const achievementUnlocked = useAchievementStore((state) => state.achievementUnlocked);
  const achievements = useAchievementStore((state) => state.achievements);
  const dismissAchievementUnlocked = useAchievementStore((state) => state.dismissAchievementUnlocked);
  const markAchievementCelebrated = useAchievementStore((state) => state.markAchievementCelebrated);
  const achievement = achievementUnlocked
    ? achievements.find((item) => item.id === achievementUnlocked.achievementId)
    : null;

  if (!achievement) return null;

  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const requirement = achievement.requirement || getAchievementRequirement(achievement.title);
  const dismiss = async () => {
    try {
      await acknowledgeProductAchievementCelebration(achievement.id);
      markAchievementCelebrated(achievement.id);
      dismissAchievementUnlocked();
      return true;
    } catch {
      Taro.showToast({ title: "庆祝确认失败，请稍后重试", icon: "none" });
      return false;
    }
  };
  const openAchievements = async () => {
    if (!await dismiss()) return;
    void Taro.navigateTo({ url: "/pages/achievements/index" });
  };

  return (
    <View className="achievement-unlock-overlay" ariaLabel="成就已解锁">
      <View className="achievement-unlock-overlay__backdrop" onClick={() => { void dismiss(); }} />
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
        <View className="achievement-unlock-overlay__primary-action" onClick={() => { void dismiss(); }}>
          <Text>继续记录</Text>
        </View>
        <Text className="achievement-unlock-overlay__secondary-action" onClick={() => { void openAchievements(); }}>
          查看成长里程
        </Text>
      </View>
    </View>
  );
}
