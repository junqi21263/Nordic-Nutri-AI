import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getProductWeeklyReview, type ProductWeeklyReview } from "../../api/insight-api";
import { AppCard } from "../../components/app-card";
import { NordicIcon } from "../../components/nordic-icon";
import { getMondayBasedWeekDates } from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import { useProfileStore } from "../../stores/profile-store";
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function getRhythmHeroAside(score: number, recordedDays: number) {
  const detail = `${recordedDays}/7 天已记录`;
  if (recordedDays <= 1) return { title: "节奏刚起步", detail };
  if (score < 40) return { title: "节奏待建立", detail };
  if (score < 70) return { title: "节奏在成形", detail };
  return { title: "节奏较稳定", detail };
}

export default function WeeklyReviewPage() {
  const meals = useMealStore();
  const profile = useProfileStore();
  const date = getLocalDateString();
  const [remoteReview, setRemoteReview] = useState<ProductWeeklyReview | null>(null);
  const summary = meals.getDailySummary(date);
  const todayMeals = meals.getMealsByDate(date);
  const localProteinCompletion = summary.protein
    ? Math.min(100, Math.round((summary.consumed.protein / summary.protein) * 100))
    : 0;
  const rhythmScore =
    remoteReview?.score ??
    Math.round(
      (summary.completion + localProteinCompletion + Math.min(100, todayMeals.length * 25)) / 3,
    );
  const proteinCompletion = remoteReview?.proteinCompletion ?? localProteinCompletion;
  const proteinLeft = remoteReview?.progress?.protein
    ? remoteReview.progress.protein.remaining
    : Math.max(0, summary.protein - summary.consumed.protein);
  const localRhythm = getMondayBasedWeekDates(date).map((dateKey) => ({
    date: dateKey,
    recorded: meals.getMealsByDate(dateKey).length > 0,
  }));
  const displayedRhythm = (remoteReview?.rhythm?.length ? remoteReview.rhythm : localRhythm).map((item) => {
    const dateKey = item.date;
    const [itemYear, itemMonth, itemDay] = dateKey.split("-").map(Number);
    const current = new Date(itemYear, itemMonth - 1, itemDay);
    return {
      date: dateKey,
      label: weekdayLabels[current.getDay()]!,
      recorded: Boolean(item.recorded),
      today: dateKey === date,
    };
  });
  const recordedDays = remoteReview?.recordedDays ?? displayedRhythm.filter((item) => item.recorded).length;
  const recordedMeals = remoteReview?.recordedMeals ?? todayMeals.length;
  const targetCalories = remoteReview?.calorieTarget ?? profile.profile.targetCalories;
  const weeklyInsight = remoteReview?.insight;
  const rhythmAside = getRhythmHeroAside(rhythmScore, recordedDays);
  const calorieCompletion = remoteReview?.calorieCompletion ?? summary.completion;
  const nextGoalPrimary = weeklyInsight?.nextSteps?.[0]
    ?? (recordedDays < 5 ? "连续记录 5 天" : "保持每天至少一餐记录");
  const nextGoalSecondary = weeklyInsight?.nextSteps?.[1]
    ?? (proteinLeft ? "安排 3 次蛋白补充" : "保持 3 天蛋白达标");

  useEffect(() => {
    void getProductWeeklyReview(date)
      .then(setRemoteReview)
      .catch(() => setRemoteReview(null));
  }, [date]);

  return (
    <PageLayout
      title="本周回顾"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--weekly-review"
    >
      <View className="weekly-review">
        <AppCard tone="dark" className="weekly-review__hero">
          <View className="weekly-review__hero-score">
            <Text className="weekly-review__hero-score-label">营养节奏分</Text>
            <Text className="weekly-review__hero-score-value">{rhythmScore}</Text>
          </View>
          <View className="weekly-review__hero-aside">
            <Text className="weekly-review__hero-aside-title">{rhythmAside.title}</Text>
            <Text className="weekly-review__hero-aside-detail">{rhythmAside.detail}</Text>
          </View>
        </AppCard>

        <View className="weekly-review__metrics">
          <View className="weekly-review__metric">
            <Text className="weekly-review__metric-label">已记录餐次</Text>
            <Text className="weekly-review__metric-value">{recordedMeals}</Text>
            <Text className="weekly-review__metric-detail">本周</Text>
          </View>
          <View className="weekly-review__metric">
            <Text className="weekly-review__metric-label">蛋白完成度</Text>
            <Text className="weekly-review__metric-value">{proteinCompletion}%</Text>
            <Text className="weekly-review__metric-detail">
              {summary.consumed.protein}/{summary.protein} g
            </Text>
          </View>
          <View className="weekly-review__metric">
            <Text className="weekly-review__metric-label">目标热量</Text>
            <Text className="weekly-review__metric-value">{targetCalories}</Text>
            <Text className="weekly-review__metric-detail">kcal</Text>
          </View>
        </View>

        <View className="weekly-review__section">
          <Text>本周观察</Text>
          <View className="weekly-review__insights">
            <View className="weekly-review__insight">
              <NordicIcon name="check" size={18} ariaLabel="记录" />
              <Text className="weekly-review__insight-copy">{weeklyInsight?.strengths?.[0] ?? `本周已记录 ${recordedMeals} 餐，持续记录会让建议更贴近你的节奏。`}</Text>
            </View>
            <View className="weekly-review__insight">
              <NordicIcon name="protein" size={18} ariaLabel="蛋白" />
              <Text className="weekly-review__insight-copy">{weeklyInsight?.summary ?? (proteinLeft
                ? `距离本周蛋白目标还差 ${proteinLeft} g，可优先补充一份高蛋白食物。`
                : "本周蛋白目标已完成，恢复节奏很好。")}</Text>
            </View>
            <View className="weekly-review__insight">
              <NordicIcon name="zap" size={18} ariaLabel="能量" />
              <Text className="weekly-review__insight-copy">营养节奏分为 {rhythmScore}，本周热量完成度 {calorieCompletion}%。</Text>
            </View>
          </View>
        </View>

        <View className="weekly-review__advice">
          <NordicIcon name="milestone" size={22} ariaLabel="本周建议" />
          <View className="weekly-review__advice-copy">
            <Text className="weekly-review__advice-title">{weeklyInsight?.headline ?? "本周建议"}</Text>
            <Text className="weekly-review__advice-description">{weeklyInsight?.nextSteps?.[0] ?? (proteinLeft
              ? "下一周优先安排瘦肉、鸡蛋或高蛋白酸奶，让目标更容易完成。"
              : "维持当前的记录频率，并留意睡眠和补水，让恢复同样跟上。")}</Text>
          </View>
        </View>

        <View className="weekly-review__section">
          <View className="weekly-review__section-head">
            <Text>本周节奏</Text>
            <Text>{recordedDays}/7 天已记录</Text>
          </View>
          <View className="weekly-review__rhythm">
            {displayedRhythm.map((item) => (
              <View
                className={`weekly-review__rhythm-day ${item.today ? "weekly-review__rhythm-day--today" : ""}`}
                key={item.date}
              >
                <View
                  className={`weekly-review__rhythm-dot ${item.recorded ? "weekly-review__rhythm-dot--recorded" : ""}`}
                />
                <Text>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="weekly-review__next-goals">
          <View className="weekly-review__next-goals-head">
            <NordicIcon name="zap" size={20} ariaLabel="下周小目标" />
            <View className="weekly-review__next-goals-copy">
              <Text className="weekly-review__next-goals-title">下周小目标</Text>
              <Text className="weekly-review__next-goals-description">不求完美，先把节奏保持下来。</Text>
            </View>
          </View>
          <View className="weekly-review__next-goal-row">
            <NordicIcon name="check" size={18} ariaLabel="下周动作" />
            <View className="weekly-review__next-goal-copy">
              <Text className="weekly-review__next-goal-title">{nextGoalPrimary}</Text>
              <Text className="weekly-review__next-goal-description">优先完成这一步，节奏会更清楚</Text>
            </View>
          </View>
          <View className="weekly-review__next-goal-row">
            <NordicIcon name="protein" size={18} ariaLabel="蛋白目标" />
            <View className="weekly-review__next-goal-copy">
              <Text className="weekly-review__next-goal-title">{nextGoalSecondary}</Text>
              <Text className="weekly-review__next-goal-description">让每日目标更容易完成</Text>
            </View>
          </View>
        </View>
        <Text className="weekly-review__source">基于已同步到云端的饮食记录生成</Text>
      </View>
    </PageLayout>
  );
}
