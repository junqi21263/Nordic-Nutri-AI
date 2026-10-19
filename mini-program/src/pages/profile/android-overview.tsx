import { Button, Text, View } from "@tarojs/components";
import { useDidHide, useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { getProductDailySummary, getProductWeeklyReview, type ProductDailySummary, type ProductWeeklyReview } from "../../api/insight-api";
import { getMilestoneJourney, type ProductMilestoneJourney } from "../../api/milestone-api";
import { Avatar } from "../../components/avatar";
import { NordicIcon } from "../../components/nordic-icon";
import { getAchievementDisplayTitle, sortAchievementsForProfilePreview } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import type { Achievement } from "../../features/coach/domain";
import { refreshProductAchievements } from "../../features/coach/refresh-achievements";
import { getLocalDateString } from "../../features/onboarding/domain";
import type { ProfileStore } from "../../stores/profile-store";
import { animateProfileNumber } from "./profile-motion";

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
  accountError: boolean;
  retryAccount: () => void;
  unreadNotifications: number;
}

export function AndroidProfileOverview({ profile, refreshVersion, openPage, openCoach, openMealRecords, openAchievement, onMotionChange, accountError, retryAccount, unreadNotifications }: Props) {
  useTranslation();
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
  const animate = visible && !reduceMotion;
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
  useEffect(() => { onMotionChange(!reduceMotion); }, [reduceMotion, onMotionChange]);

  const protein = daily ? Math.max(0, Math.min(100, daily.targets.protein > 0 ? Math.round(daily.consumed.protein / daily.targets.protein * 100) : 0)) : undefined;
  const calories = daily?.targets.calories;
  const calorieProgress = daily && daily.targets.calories > 0 ? Math.max(0, Math.min(100, daily.consumed.calories / daily.targets.calories * 100)) : 0;
  const sorted = achievements ? sortAchievementsForProfilePreview(achievements) : [];
  const openJourney = () => openPage("/pages/milestone-journey/index");
  const goalKeys: Record<string, string> = { "增益增肌": "muscle_gain", "轻盈减脂": "fat_loss", "保持状态": "maintenance", "健康饮食": "performance" };
  const goal = goalKeys[profile.profile.goalLabel] ? t(`onboarding.goals.${goalKeys[profile.profile.goalLabel]}.title`) : profile.profile.goalLabel;

  return <View className={`profile-stitch__overview${animate ? " profile-stitch__overview--animated" : ""}${animate && reveal ? " profile-stitch__overview--motion" : ""}`}>
    <View className="profile-stitch__header">
      <View><Text className="profile-stitch__brand">NORDIC</Text><Text className="profile-stitch__space"> / MY SPACE</Text></View>
      <Button className="profile-stitch__inbox" ariaLabel={t("notifications.title")} onClick={() => openPage("/pages/notifications/index")}>
        <NordicIcon name="mail" size={22} ariaLabel={t("notifications.title")} />
        {unreadNotifications > 0 ? <View className="profile-stitch__inbox-dot" /> : null}
      </Button>
    </View>
    <View className="profile-stitch__hero profile-stitch__reveal">
      <Button className="profile-stitch__identity" onClick={() => openPage("/pages/profile-edit/index")} ariaLabel={t("profileOverview.editProfile")}>
        <View className="profile-stitch__avatar"><Avatar label={profile.profile.nickname.slice(0, 1)} src={profile.profile.avatarUrl} size="large" /><View className="profile-stitch__status-dot" /></View>
        <View className="profile-stitch__identity-copy">
          <View className="profile-stitch__name-row"><Text className="profile-stitch__name">{identityReady ? profile.profile.nickname || t("profileOverview.noNickname") : t("profileOverview.loadingProfile")}</Text><Text className="profile-stitch__edit">{t("profile.editProfile")} →</Text></View>
          <Text className="profile-stitch__goal">{identityReady ? `${goal} · ${t("profileOverview.currentWeight", { weight: profile.profile.weight })}` : "—"}</Text>
          <Text className="profile-stitch__badge">{weekly ? weekly.recordedMeals > 0 ? t("profileOverview.movingForward") : t("profileOverview.startWithMeal") : t("profileOverview.syncing")}</Text>
        </View>
      </Button>
      <Text className="profile-stitch__quote">“ {t("profileOverview.quote")}</Text>
    </View>
    {(loading || failed || accountError || profile.dataStatus === "error") && <View className="profile-stitch__load-state" role="status"><Text>{failed || accountError || profile.dataStatus === "error" ? t("profileOverview.partialData") : t("profileOverview.updating")}</Text>{(failed || accountError || profile.dataStatus === "error") && <Button onClick={() => { retryAccount(); void refresh(); }}>{t("profileOverview.retry")}</Button>}</View>}
    <View className="profile-stitch__reveal profile-stitch__daily">
      <View className="profile-stitch__section-head"><Text>{t("profileOverview.dailyProgress")}</Text><Button onClick={() => openPage("/pages/goal-adjust/index")}>{t("profileOverview.manageGoals")}</Button></View>
      <View className="profile-stitch__metrics">
        <Button className="profile-stitch__calories profile-stitch__card" onClick={() => openPage("/pages/goal-adjust/index")}>
          <View className="profile-stitch__metric-head"><Text>{t("profileOverview.calorieTarget")}</Text><Text className="profile-stitch__tag">{t("profileOverview.adjustable")}</Text></View>
          <View className="profile-stitch__calorie-main"><View className="profile-stitch__ring" style={{ background: `conic-gradient(#18352a ${calorieProgress}%, #eee9df 0)` }}><Text>KCAL</Text></View><View><View className="profile-stitch__number"><ProfileNumber value={calories} animate={animate} /></View><Text className="profile-stitch__muted">{t("profileOverview.calorieBalance")}</Text></View></View>
          <View className="profile-stitch__calorie-footer"><Text>{t("profileOverview.consumedToday")}</Text><Text>{daily ? `${Math.round(daily.consumed.calories)} kcal` : "—"}</Text></View>
        </Button>
        <View className="profile-stitch__metric-side">
          <Button className="profile-stitch__protein profile-stitch__card" onClick={openCoach}>
            <View className="profile-stitch__metric-head"><Text>{t("profileOverview.proteinProgress")}</Text><Text className="profile-stitch__tag profile-stitch__tag--today">{t("profileOverview.today")}</Text></View>
            <Text className="profile-stitch__number">{protein === undefined ? "—" : `${protein}%`}</Text>
            <View className="profile-stitch__track" ariaLabel={t("profileOverview.proteinAria", { value: protein === undefined ? t("profileOverview.notLoaded") : `${protein}%` })}><View style={{ transform: `scaleX(${(protein ?? 0) / 100})` }} /></View>
            <Text className="profile-stitch__muted">{daily ? daily.consumed.protein === 0 ? t("profileOverview.notLoggedToday") : t("profileOverview.proteinConsumed", { value: Math.round(daily.consumed.protein) }) : t("profileOverview.waitingNutrition")}</Text>
          </Button>
          <View className="profile-stitch__mini-stats"><Button onClick={openMealRecords}><Text className="profile-stitch__small-number"><ProfileNumber value={weekly?.recordedMeals} animate={animate} /></Text><Text>{t("profileOverview.mealsThisWeek")}</Text></Button><Button onClick={openJourney}><Text className="profile-stitch__small-number"><ProfileNumber value={journey?.currentStreakDays} animate={animate} /><Text className="profile-stitch__unit">{t("profileOverview.days")}</Text></Text><Text>{t("profileOverview.streak")}</Text></Button></View>
        </View>
      </View>
    </View>
    <View className="profile-stitch__reveal profile-stitch__journey">
      <View className="profile-stitch__section-head"><Text>{t("profileOverview.journey")}</Text><Text>{t("profileOverview.streakDays", { count: journey?.currentStreakDays ?? "—" })}</Text></View>
      <View className="profile-stitch__card profile-stitch__journal">
        <View className="profile-stitch__journal-head"><View className="profile-stitch__sprout"><NordicIcon name="reminder-leaf" size={16} /></View><View><Text className="profile-stitch__title">{t("profileOverview.sproutWeek")}</Text><Text className="profile-stitch__muted">{t("profileOverview.sproutHint")}</Text></View><Text className="profile-stitch__day">{t("profileOverview.day", { count: journey?.currentStreakDays ?? "—" })}</Text></View>
        <View className="profile-stitch__week">{weekly ? weekly.rhythm.map((day) => <View key={day.date} className="profile-stitch__week-day" ariaLabel={`${day.date} ${t(day.recorded ? "profileOverview.recorded" : "profileOverview.notRecorded")}`}><Text>{t(`records.weekdays.${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${day.date}T12:00:00`).getDay()]}`)}</Text><View className={`profile-stitch__seed${day.recorded ? " profile-stitch__seed--recorded" : ""}`}>{day.recorded ? <NordicIcon name="check-inverse" size={14} /> : <View />}</View></View>) : <Text className="profile-stitch__muted">{t("profileOverview.calendarLoading")}</Text>}</View>
        <Button className="profile-stitch__journey-link" onClick={openJourney}><Text>{t("profileOverview.viewJourney")}</Text><Text>→</Text></Button>
      </View>
    </View>
    <View className="profile-stitch__reveal profile-stitch__achievements">
      <View className="profile-stitch__section-head"><View><Text className="profile-stitch__title">{t("profileOverview.achievements")}</Text><Text className="profile-stitch__english"> LITTLE ACHIEVEMENTS</Text></View><Button onClick={() => openPage("/pages/achievements/index")}>{achievements ? `${achievements.filter((item) => item.unlocked).length} / ${achievements.length}` : "—"} · {t("profileOverview.all")}</Button></View>
      <View className="profile-stitch__gallery">{sorted.map((item) => { const title = getAchievementDisplayTitle(item.title, (key) => t(key)); return <Button key={item.id} className={`profile-stitch__achievement${item.unlocked ? "" : " profile-stitch__achievement--locked"}`} onClick={() => openAchievement(item)} ariaLabel={title}><View className="profile-stitch__achievement-icon"><NordicIcon name={getAchievementIcon(item)} size={24} ariaLabel={title} /></View><Text>{title}</Text><Text className="profile-stitch__achievement-status">{item.unlocked ? t("profileOverview.unlocked") : t("profileOverview.locked")}</Text></Button>; })}{!sorted.length && <Text className="profile-stitch__muted">{achievements ? t("profileOverview.noAchievements") : t("profileOverview.achievementsLoading")}</Text>}</View>
    </View>
    <Button className="profile-stitch__weekly profile-stitch__reveal" onClick={() => openPage("/pages/weekly-review/index")}>
      <View><Text className="profile-stitch__english">WEEKLY REFLECTION</Text><Text className="profile-stitch__title">{t("profileOverview.weeklyReview")}</Text><Text className="profile-stitch__muted">{weekly?.recordedMeals ? t("profileOverview.weeklyWithMeals") : t("profileOverview.weeklyWithoutMeals")}</Text></View>
      <View className="profile-stitch__weekly-score"><Text>{t("profileOverview.rhythm")}</Text><Text><Text className="profile-stitch__number">{weekly?.score ?? "—"}</Text> {t("profileOverview.points")}</Text></View>
    </Button>
  </View>;
}
