import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { AchievementDetailSheet } from "../../components/achievement-detail-sheet";
import { NordicIcon } from "../../components/nordic-icon";
import {
  getAchievementRequirement,
} from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import { createAchievements, type Achievement } from "../../features/coach/domain";
import { refreshProductAchievements } from "../../features/coach/refresh-achievements";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useAchievementStore } from "../../stores/achievement-store";
import { useMealStore } from "../../stores/meal-store";

type AchievementFilter = "all" | "unlocked" | "progress";

function enrichAchievement(achievement: Achievement): Achievement {
  return {
    ...achievement,
    requirement: achievement.requirement || getAchievementRequirement(achievement.title),
    available: achievement.available !== false,
  };
}

export default function AchievementsPage() {
  const achievements = useAchievementStore();
  const meals = useMealStore();
  const date = getLocalDateString();
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const [selected, setSelected] = useState<Achievement | null>(null);
  const showAchievementCelebration = useAchievementStore((state) => state.showAchievementCelebration);
  const isPageScrollLocked = selected !== null
    || achievements.manualAchievementCelebration !== null
    || achievements.achievementUnlocked !== null;

  const list = useMemo(() => {
    const source = achievements.achievements.length
      ? achievements.achievements
      : createAchievements(meals.meals, date);
    return source.map(enrichAchievement);
  }, [achievements.achievements, date, meals.meals]);

  const unlockedCount = list.filter((item) => item.unlocked).length;
  const inProgressCount = list.filter((item) => !item.unlocked && item.available !== false).length;

  const visible = useMemo(() => {
    if (filter === "unlocked") return list.filter((item) => item.unlocked);
    if (filter === "progress") return list.filter((item) => !item.unlocked);
    return list;
  }, [filter, list]);

  useEffect(() => {
    void refreshProductAchievements(date).catch(() => undefined);
  }, [date]);

  const openDetail = (achievement: Achievement) => {
    setSelected(enrichAchievement(achievement));
  };
  const openAchievement = (achievement: Achievement) => {
    if (achievement.unlocked) {
      showAchievementCelebration(enrichAchievement(achievement));
      return;
    }
    openDetail(achievement);
  };

  return (
    <PageLayout
      title="全部成就"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      scrollLocked={isPageScrollLocked}
      className="page-layout--achievements"
    >
      <View className="profile-subpage__page-title">
        <Text>全部成就</Text>
      </View>

      <View className="achievement-center">
        <View className="achievement-center__hero">
          <View className="achievement-center__hero-mark">
            <NordicIcon name="celebration" size={28} ariaLabel="成就" />
          </View>
          <View className="achievement-center__hero-copy">
            <Text className="achievement-center__hero-title">已收集 {unlockedCount} / {list.length}</Text>
            <Text className="achievement-center__hero-sub">
              点按卡片查看目标或达成时间 · 依据云端记录计算
            </Text>
          </View>
          <View className="achievement-center__hero-meter" aria-hidden>
            <View
              className="achievement-center__hero-meter-fill"
              style={{ width: `${list.length ? Math.round((unlockedCount / list.length) * 100) : 0}%` }}
            />
          </View>
        </View>

        <View className="achievement-center__filters" aria-label="成就筛选">
          {([
            ["all", `全部 ${list.length}`],
            ["unlocked", `已解锁 ${unlockedCount}`],
            ["progress", `进行中 ${inProgressCount}`],
          ] as Array<[AchievementFilter, string]>).map(([key, label]) => (
            <Text
              key={key}
              className={`achievement-center__filter ${filter === key ? "achievement-center__filter--active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </Text>
          ))}
        </View>

        <View className="achievement-center__grid">
          {visible.map((achievement) => {
            const locked = !achievement.unlocked;
            const comingSoon = achievement.available === false;
            return (
              <View
                key={achievement.id}
                className={`achievement-center__item ${locked ? "achievement-center__item--locked" : ""} ${comingSoon ? "achievement-center__item--soon" : ""}`}
                onClick={() => openAchievement(achievement)}
              >
                <View className="achievement-center__item-icon">
                  <NordicIcon
                    name={getAchievementIcon(achievement)}
                    size={26}
                    ariaLabel={achievement.title}
                  />
                </View>
                <Text className="achievement-center__item-title">{achievement.title}</Text>
                <Text className="achievement-center__item-status">
                  {comingSoon
                    ? "即将上线"
                    : achievement.unlocked
                      ? "已解锁 · 查看时间"
                      : `完成度 ${achievement.progress}%`}
                </Text>
                {!achievement.unlocked && !comingSoon ? (
                  <View className="achievement-center__item-bar">
                    <View
                      className="achievement-center__item-bar-fill"
                      style={{ width: `${Math.min(100, achievement.progress || 0)}%` }}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      <AchievementDetailSheet achievement={selected} onDismiss={() => setSelected(null)} />
    </PageLayout>
  );
}
