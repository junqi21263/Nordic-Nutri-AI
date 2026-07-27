import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect } from "react";
import { getProductAchievements } from "../../api/insight-api";
import { NordicIcon } from "../../components/nordic-icon";
import { createAchievements } from "../../features/coach/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useAchievementStore } from "../../stores/achievement-store";
import { useMealStore } from "../../stores/meal-store";
export default function AchievementsPage() {
  const achievements = useAchievementStore();
  const meals = useMealStore();
  const date = getLocalDateString();
  const list = achievements.achievements.length
    ? achievements.achievements
    : createAchievements(meals.meals, date);
  const unlocked = list.filter((achievement) => achievement.unlocked).length;

  useEffect(() => {
    void getProductAchievements(date)
      .then(achievements.setAchievements)
      .catch(() => undefined);
  }, [achievements.setAchievements, date]);

  return (
    <PageLayout
      title="全部成就"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--achievements"
    >
      <View className="profile-subpage__page-title">
        <Text>全部成就</Text>
      </View>
      <View className="achievement-center">
        <View className="achievement-center__summary">
          <NordicIcon name="celebration" size={28} ariaLabel="成就" />
          <View>
            <Text>已收集 {unlocked} 枚成就</Text>
            <Text>所有成就均根据已同步到云端的记录计算。</Text>
          </View>
        </View>
        <View className="achievement-center__grid">
          {list.map((achievement) => (
            <View
              className={`achievement-center__item ${achievement.unlocked ? "" : "achievement-center__item--locked"}`}
              key={achievement.id}
            >
              <NordicIcon
                name={achievement.unlocked ? "sparkles" : "milestone"}
                size={24}
                ariaLabel={achievement.title}
              />
              <Text>{achievement.title}</Text>
              <Text>{achievement.unlocked ? "已解锁" : `完成度 ${achievement.progress}%`}</Text>
            </View>
          ))}
        </View>
      </View>
    </PageLayout>
  );
}
