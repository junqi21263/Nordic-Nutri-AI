import { Button, Text, View } from "@tarojs/components";
import { useDidHide, useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { getProductDailySummary, getProductWeeklyReview, type ProductDailySummary, type ProductWeeklyReview } from "../../api/insight-api";
import { getMilestoneJourney, type ProductMilestoneJourney } from "../../api/milestone-api";
import { Avatar } from "../../components/avatar";
import { NordicIcon } from "../../components/nordic-icon";
import { sortAchievementsForProfilePreview } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import type { Achievement } from "../../features/coach/domain";
import { refreshProductAchievements } from "../../features/coach/refresh-achievements";
import { getLocalDateString } from "../../features/onboarding/domain";
import type { ProfileStore } from "../../stores/profile-store";
import { animateProfileNumber, profileWeekday } from "./profile-motion";

function ProfileNumber({ value, animate }: { value: number | undefined; animate: boolean }) {
  const [display, setDisplay] = useState<number>();
  const played = useRef(false);
  useEffect(() => {
    if (value === undefined) return;
    if (!animate || played.current) {
      setDisplay(value);
      played.current = true;
      return;
    }
    played.current = true;
    setDisplay(0);
    return animateProfileNumber(value, setDisplay);
  }, [value, animate]);
  return <Text>{value === undefined ? "—" : display ?? (animate && !played.current ? 0 : value)}</Text>;
}

interface Props {
  profile: ProfileStore;
  refreshVersion: number;
  openPage: (url: string) => void;
  openCoach: () => void;
  openMealRecords: () => void;
  openAchievement: (achievement: Achievement) => void;
  onMotionChange: (enabled: boolean) => void;
  motionOff: boolean;
  accountError: boolean;
  retryAccount: () => void;
}

export function AndroidProfileOverview({ profile, refreshVersion, openPage, openCoach, openMealRecords, openAchievement, onMotionChange, motionOff, accountError, retryAccount }: Props) {
  const [daily, setDaily] = useState<ProductDailySummary | null>(null);
  const [weekly, setWeekly] = useState<ProductWeeklyReview | null>(null);
  const [journey, setJourney] = useState<ProductMilestoneJourney | null>(null);
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reveal, setReveal] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(() => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const animate = visible && !reduceMotion && !motionOff;
  const identityReady = profile.dataStatus === "ready";

  const refresh = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = ++generation.current;
    const date = getLocalDateString();
    setLoading(true);
    setFailed(false);
    // Independent resources: one failing endpoint must not erase successful data.
    const results = await Promise.allSettled([
      getProductDailySummary(date, { light: true }),
      getProductWeeklyReview(date, { preferFast: true }),
      getMilestoneJourney(),
      refreshProductAchievements(date),
    ]);
    if (request !== generation.current) return;
    const [day, week, streak, badges] = results;
    if (day.status === "fulfilled") setDaily(day.value);
    if (week.status === "fulfilled") setWeekly(week.value);
    if (streak.status === "fulfilled") setJourney(streak.value);
    if (badges.status === "fulfilled") setAchievements(badges.value);
    setFailed(results.some((result) => result.status === "rejected"));
    setLoading(false);
    inFlight.current = false;
  };
  useDidShow(() => { setVisible(true); void refresh(); });
  useDidHide(() => {
    setVisible(false);
    setReveal(false);
    generation.current += 1;
    inFlight.current = false;
  });
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setReveal(false), 800);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => { if (refreshVersion) void refresh(); }, [refreshVersion]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { onMotionChange(!reduceMotion && !motionOff); }, [reduceMotion, motionOff, onMotionChange]);

  const protein = daily ? Math.max(0, Math.min(100, daily.targets.protein > 0 ? Math.round(daily.consumed.protein / daily.targets.protein * 100) : 0)) : undefined;
  const calories = daily?.targets.calories;
  const calorieProgress = daily && daily.targets.calories > 0 ? Math.max(0, Math.min(100, daily.consumed.calories / daily.targets.calories * 100)) : 0;
  const sorted = achievements ? sortAchievementsForProfilePreview(achievements) : [];
  const openJourney = () => openPage("/pages/milestone-journey/index");

  return <View className={`profile-stitch__overview${animate ? " profile-stitch__overview--animated" : ""}${animate && reveal ? " profile-stitch__overview--motion" : ""}`}>
    <View className="profile-stitch__header">
      <View><Text className="profile-stitch__brand">NORDIC</Text><Text className="profile-stitch__space"> / MY SPACE</Text></View>
    </View>
    <View className="profile-stitch__hero profile-stitch__reveal">
      <Button className="profile-stitch__identity" onClick={() => openPage("/pages/profile-edit/index")} ariaLabel="编辑个人资料">
        <View className="profile-stitch__avatar"><Avatar label={profile.profile.nickname.slice(0, 1)} src={profile.profile.avatarUrl} size="large" /><View className="profile-stitch__status-dot" /></View>
        <View className="profile-stitch__identity-copy">
          <View className="profile-stitch__name-row"><Text className="profile-stitch__name">{identityReady ? profile.profile.nickname || "未设置昵称" : "资料加载中"}</Text><Text className="profile-stitch__edit">编辑资料 →</Text></View>
          <Text className="profile-stitch__goal">{identityReady ? `${profile.profile.goalLabel} · 当前 ${profile.profile.weight} kg` : "—"}</Text>
          <Text className="profile-stitch__badge">{weekly ? weekly.recordedMeals > 0 ? "稳定前进中" : "从这一餐开始" : "记录同步中"}</Text>
        </View>
      </Button>
      <Text className="profile-stitch__quote">“ 每一份认真记录，都在慢慢成为更好的自己。</Text>
    </View>
    {(loading || failed || accountError || profile.dataStatus === "error") && <View className="profile-stitch__load-state" role="status"><Text>{failed || accountError || profile.dataStatus === "error" ? "部分数据暂未更新，已保留上次结果" : "正在更新成长数据"}</Text>{(failed || accountError || profile.dataStatus === "error") && <Button onClick={() => { retryAccount(); void refresh(); }}>重试</Button>}</View>}
    <View className="profile-stitch__reveal profile-stitch__daily">
      <View className="profile-stitch__section-head"><Text>01 / DAILY PROGRESS · 成长概览</Text><Button onClick={() => openPage("/pages/goal-adjust/index")}>目标管理</Button></View>
      <View className="profile-stitch__metrics">
        <Button className="profile-stitch__calories profile-stitch__card" onClick={() => openPage("/pages/goal-adjust/index")}>
          <View className="profile-stitch__metric-head"><Text>目标热量</Text><Text className="profile-stitch__tag">可调整</Text></View>
          <View className="profile-stitch__calorie-main"><View className="profile-stitch__ring" style={{ background: `conic-gradient(#18352a ${calorieProgress}%, #eee9df 0)` }}><Text>KCAL</Text></View><View><View className="profile-stitch__number"><ProfileNumber value={calories} animate={animate} /></View><Text className="profile-stitch__muted">千卡标准配比</Text></View></View>
          <View className="profile-stitch__calorie-footer"><Text>今日已摄入</Text><Text>{daily ? `${Math.round(daily.consumed.calories)} kcal` : "—"}</Text></View>
        </Button>
        <View className="profile-stitch__metric-side">
          <Button className="profile-stitch__protein profile-stitch__card" onClick={openCoach}>
            <View className="profile-stitch__metric-head"><Text>蛋白完成度</Text><Text className="profile-stitch__tag profile-stitch__tag--today">今日</Text></View>
            <Text className="profile-stitch__number">{protein === undefined ? "—" : `${protein}%`}</Text>
            <View className="profile-stitch__track" ariaLabel={`蛋白质完成度 ${protein ?? "尚未加载"}${protein === undefined ? "" : "%"}`}><View style={{ transform: `scaleX(${(protein ?? 0) / 100})` }} /></View>
            <Text className="profile-stitch__muted">{daily ? daily.consumed.protein === 0 ? "今日待记录" : `已摄入 ${Math.round(daily.consumed.protein)} g` : "等待营养数据"}</Text>
          </Button>
          <View className="profile-stitch__mini-stats"><Button onClick={openMealRecords}><Text className="profile-stitch__small-number"><ProfileNumber value={weekly?.recordedMeals} animate={animate} /></Text><Text>本周餐次</Text></Button><Button onClick={openJourney}><Text className="profile-stitch__small-number"><ProfileNumber value={journey?.currentStreakDays} animate={animate} /><Text className="profile-stitch__unit">天</Text></Text><Text>连续记录</Text></Button></View>
        </View>
      </View>
    </View>
    <View className="profile-stitch__reveal profile-stitch__journey">
      <View className="profile-stitch__section-head"><Text>02 / YOUR JOURNEY · 成长手账</Text><Text>连续记录 {journey?.currentStreakDays ?? "—"} 天</Text></View>
      <View className="profile-stitch__card profile-stitch__journal">
        <View className="profile-stitch__journal-head"><View className="profile-stitch__sprout"><NordicIcon name="reminder-leaf" size={16} /></View><View><Text className="profile-stitch__title">本周萌芽周期</Text><Text className="profile-stitch__muted">坚持每日打卡，滋养健康种子</Text></View><Text className="profile-stitch__day">Day {journey?.currentStreakDays ?? "—"}</Text></View>
        <View className="profile-stitch__week">{weekly ? weekly.rhythm.map((day) => <View key={day.date} className="profile-stitch__week-day" ariaLabel={`${day.date} ${day.recorded ? "已记录" : "未记录"}`}><Text>{profileWeekday(day.date)}</Text><View className={`profile-stitch__seed${day.recorded ? " profile-stitch__seed--recorded" : ""}`}>{day.recorded ? <NordicIcon name="check-inverse" size={14} /> : <View />}</View></View>) : <Text className="profile-stitch__muted">记录日历尚未加载</Text>}</View>
        <Button className="profile-stitch__journey-link" onClick={openJourney}><Text>查看完整健康旅程</Text><Text>→</Text></Button>
      </View>
    </View>
    <View className="profile-stitch__reveal profile-stitch__achievements">
      <View className="profile-stitch__section-head"><View><Text className="profile-stitch__title">我的小成就</Text><Text className="profile-stitch__english"> LITTLE ACHIEVEMENTS</Text></View><Button onClick={() => openPage("/pages/achievements/index")}>{achievements ? `${achievements.filter((item) => item.unlocked).length} / ${achievements.length}` : "—"} · 全部 ›</Button></View>
      <View className="profile-stitch__gallery">{sorted.map((item) => <Button key={item.id} className={`profile-stitch__achievement${item.unlocked ? "" : " profile-stitch__achievement--locked"}`} onClick={() => openAchievement(item)}><View className="profile-stitch__achievement-icon"><NordicIcon name={getAchievementIcon(item)} size={24} /></View><Text>{item.title}</Text><Text className="profile-stitch__achievement-status">{item.unlocked ? "已点亮" : "未点亮"}</Text></Button>)}{!sorted.length && <Text className="profile-stitch__muted">{achievements ? "暂无成就，记录从这一餐开始" : "成就尚未加载"}</Text>}</View>
    </View>
    <Button className="profile-stitch__weekly profile-stitch__reveal" onClick={() => openPage("/pages/weekly-review/index")}>
      <View><Text className="profile-stitch__english">WEEKLY REFLECTION</Text><Text className="profile-stitch__title">本周回顾</Text><Text className="profile-stitch__muted">{weekly?.recordedMeals ? "保持记录，慢慢找到自己的饮食节奏。" : "从这一餐开始，慢慢找到自己的节奏。"}</Text></View>
      <View className="profile-stitch__weekly-score"><Text>营养节奏</Text><Text><Text className="profile-stitch__number">{weekly?.score ?? "—"}</Text> 分 ›</Text></View>
    </Button>
  </View>;
}
