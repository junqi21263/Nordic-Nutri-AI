import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { AchievementDetailSheet } from "../../components/achievement-detail-sheet";
import { NordicIcon } from "../../components/nordic-icon";
import {
  getAchievementRequirement,
  getAchievementTranslationSlug,
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
  const { t } = useTranslation();
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
  const achievementTitle = (achievement: Achievement) => {
    const slug = getAchievementTranslationSlug(achievement.title);
    return slug ? t(`achievements.items.${slug}.title`) : achievement.title;
  };

  return (
    <PageLayout
      title={t("achievements.title")}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      scrollLocked={isPageScrollLocked}
      className="page-layout--achievements"
    >
      <View className="profile-subpage__page-title">
        <Text>{t("achievements.title")}</Text>
      </View>

      <View className="achievement-center">
        <View className="achievement-center__hero">
          <View className="achievement-center__hero-mark">
            <NordicIcon name="celebration" size={28} ariaLabel={t("achievements.title")} />
          </View>
          <View className="achievement-center__hero-copy">
            <Text className="achievement-center__hero-title">{t("achievements.count", { unlocked: unlockedCount, total: list.length })}</Text>
            <Text className="achievement-center__hero-sub">
              {t("achievements.hint")}
            </Text>
          </View>
          <View className="achievement-center__hero-meter" aria-hidden>
            <View
              className="achievement-center__hero-meter-fill"
              style={{ width: `${list.length ? Math.round((unlockedCount / list.length) * 100) : 0}%` }}
            />
          </View>
        </View>

        <View className="achievement-center__filters" aria-label={t("achievements.filterLabel")}>
          {([
            ["all", t("achievements.filters.all", { count: list.length })],
            ["unlocked", t("achievements.filters.unlocked", { count: unlockedCount })],
            ["progress", t("achievements.filters.progress", { count: inProgressCount })],
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
                    size={20}
                    ariaLabel={achievementTitle(achievement)}
                  />
                </View>
                <Text className="achievement-center__item-title">{achievementTitle(achievement)}</Text>
                <Text className="achievement-center__item-status">
                  {comingSoon
                    ? t("achievements.states.upcoming")
                    : achievement.unlocked
                      ? t("achievements.states.unlockedCard")
                      : t("achievements.states.progress", { progress: achievement.progress })}
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
