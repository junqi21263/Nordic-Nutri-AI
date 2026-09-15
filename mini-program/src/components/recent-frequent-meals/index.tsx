import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getProductMealsRange } from "../../api/meal-data-api";
import { getRecentFrequentMeals } from "../../features/meals/recent-frequent-meals";
import { getMealNutrition, shiftDate } from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import { AppButton } from "../app-button";
import { Loading } from "../loading";
import "./index.scss";

function RecentFrequentSkeleton() {
  return <View className="recent-frequent__skeleton" ariaLabel="正在整理最近常吃">
    <Loading label="正在整理最近常吃…" />
    {[0, 1].map((index) => <View className="recent-frequent__skeleton-row" key={index}>
      <View className="recent-frequent__skeleton-copy">
        <View className="recent-frequent__skeleton-title skeleton" />
        <View className="recent-frequent__skeleton-meta skeleton" />
      </View>
      <View className="recent-frequent__skeleton-button skeleton" />
    </View>)}
  </View>;
}

export function RecentFrequentMeals({ refreshVersion }: { refreshVersion: number }) {
  const [groups, setGroups] = useState<ReturnType<typeof getRecentFrequentMeals>>([]);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const today = getLocalDateString();
    setStatus("loading");
    void getProductMealsRange(shiftDate(today, -30), today).then((meals) => {
      if (!cancelled) { setGroups(getRecentFrequentMeals(meals)); setStatus("ready"); }
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [refreshVersion, retry]);
  return <View className="recent-frequent">
    <View className="recent-frequent__heading"><Text>最近常吃</Text><AppButton variant="ghost" size="small" onClick={() => { void Taro.navigateTo({ url: "/pages/frequent-meals/index" }); }}>查看全部</AppButton></View>
    {status === "error" ? <AppButton variant="ghost" size="small" onClick={() => setRetry((value) => value + 1)}>常吃推荐加载失败，点击重试</AppButton> : status === "loading" && !groups.length ? <RecentFrequentSkeleton /> : groups.length === 0 ? <Text className="recent-frequent__meta">多记录几餐，常吃的搭配会出现在这里。</Text> : groups.map(({ meal }) => <View className="recent-frequent__row" key={meal.id}>
      <View className="recent-frequent__copy"><Text>{meal.title}</Text><Text className="recent-frequent__meta">上次记录：{meal.date} · {Math.round(getMealNutrition(meal).calories)} kcal</Text></View>
      <AppButton size="small" onClick={() => { usePortionDraftStore.getState().startMealRepeat(meal); void Taro.navigateTo({ url: "/pages/portion-adjustment/index?mode=repeat" }); }}>快速记录</AppButton>
    </View>)}
  </View>;
}
