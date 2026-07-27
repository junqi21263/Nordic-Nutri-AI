import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getProductWeeklyReview, type ProductWeeklyReview } from "../../api/insight-api";
import { AppCard } from "../../components/app-card";
import { NordicIcon } from "../../components/nordic-icon";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import { useProfileStore } from "../../stores/profile-store";
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

const formatDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
  const proteinLeft = Math.max(0, summary.protein - summary.consumed.protein);
  const [year, month, day] = date.split("-").map(Number);
  const weekRhythm = Array.from({ length: 7 }, (_, index) => {
    const current = new Date(year, month - 1, day - (6 - index));
    const dateKey = formatDate(current);
    return {
      label: weekdayLabels[current.getDay()]!,
      recorded: meals.getMealsByDate(dateKey).length > 0,
      today: dateKey === date,
    };
  });
  const remoteWeekRhythm = remoteReview?.rhythm.map((item) => {
    const [itemYear, itemMonth, itemDay] = item.date.split("-").map(Number);
    const current = new Date(itemYear, itemMonth - 1, itemDay);
    return {
      label: weekdayLabels[current.getDay()]!,
      recorded: item.recorded,
      today: item.date === date,
    };
  });
  const displayedRhythm = remoteWeekRhythm ?? weekRhythm;
  const recordedDays =
    remoteReview?.recordedDays ?? weekRhythm.filter((item) => item.recorded).length;
  const recordedMeals = remoteReview?.recordedMeals ?? todayMeals.length;
  const targetCalories = remoteReview?.calorieTarget ?? profile.profile.targetCalories;

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
      <View className="profile-subpage__page-title">
        <Text>本周回顾</Text>
      </View>
      <View className="weekly-review">
        <AppCard tone="dark" className="weekly-review__hero">
          <View>
            <Text>营养节奏分</Text>
            <Text>{rhythmScore}</Text>
          </View>
          <Text>记录保持得越稳定，分数越能反映你的节奏。</Text>
        </AppCard>

        <View className="weekly-review__metrics">
          <View>
            <Text>已记录餐次</Text>
            <Text>{recordedMeals}</Text>
            <Text>本周</Text>
          </View>
          <View>
            <Text>蛋白完成度</Text>
            <Text>{proteinCompletion}%</Text>
            <Text>
              {summary.consumed.protein}/{summary.protein} g
            </Text>
          </View>
          <View>
            <Text>目标热量</Text>
            <Text>{targetCalories}</Text>
            <Text>kcal</Text>
          </View>
        </View>

        <View className="weekly-review__section">
          <Text>本周观察</Text>
          <View className="weekly-review__insights">
            <View>
              <NordicIcon name="check" size={18} ariaLabel="记录" />
              <Text>本周已记录 {recordedMeals} 餐，持续记录会让建议更贴近你的节奏。</Text>
            </View>
            <View>
              <NordicIcon name="protein" size={18} ariaLabel="蛋白" />
              <Text>
                {proteinLeft
                  ? `距离蛋白目标还差 ${proteinLeft} g，可优先补充一份高蛋白食物。`
                  : "今日蛋白目标已完成，恢复节奏很好。"}
              </Text>
            </View>
            <View>
              <NordicIcon name="zap" size={18} ariaLabel="能量" />
              <Text>
                营养节奏分为 {rhythmScore}，当前每日目标为 {targetCalories} kcal。
              </Text>
            </View>
          </View>
        </View>

        <View className="weekly-review__advice">
          <NordicIcon name="sparkles" size={22} ariaLabel="本周建议" />
          <View>
            <Text>本周建议</Text>
            <Text>
              {proteinLeft
                ? "下一餐优先安排瘦肉、鸡蛋或高蛋白酸奶，让目标更容易完成。"
                : "维持当前的记录频率，并留意睡眠和补水，让恢复同样跟上。"}
            </Text>
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
                key={`${item.label}-${item.today}`}
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
            <NordicIcon name="sparkles" size={20} ariaLabel="下周小目标" />
            <View>
              <Text>下周小目标</Text>
              <Text>不求完美，先把节奏保持下来。</Text>
            </View>
          </View>
          <View className="weekly-review__next-goal-row">
            <NordicIcon name="check" size={18} ariaLabel="连续记录" />
            <View>
              <Text>连续记录 5 天</Text>
              <Text>每天先完成一餐记录即可</Text>
            </View>
          </View>
          <View className="weekly-review__next-goal-row">
            <NordicIcon name="protein" size={18} ariaLabel="蛋白目标" />
            <View>
              <Text>{proteinLeft ? "安排 3 次蛋白补充" : "保持 3 天蛋白达标"}</Text>
              <Text>让每日目标更容易完成</Text>
            </View>
          </View>
        </View>
        <Text className="weekly-review__source">基于已同步到云端的饮食记录生成</Text>
      </View>
    </PageLayout>
  );
}
