import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { Text, Textarea, View } from "@tarojs/components";
import { LanguageSettings } from "../../components/language-settings";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { AchievementDetailSheet } from "../../components/achievement-detail-sheet";
import { Avatar } from "../../components/avatar";
import { Badge } from "../../components/badge";
import { BottomSheet, bottomSheetExitDuration } from "../../components/bottom-sheet";
import { ListItem } from "../../components/list-item";
import { NordicIcon } from "../../components/nordic-icon";
import { StatisticCard } from "../../components/statistic-card";
import {
  getMyFeedback,
  markFeedbackRepliesRead,
  submitProductFeedback,
  type ProductFeedbackItem,
} from "../../api/feedback-api";
import { getProductAccount } from "../../api/product-data-api";
import { getProductWeeklyReview, type ProductWeeklyReview } from "../../api/insight-api";
import { getMilestoneJourney, type ProductMilestoneJourney } from "../../api/milestone-api";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import { getAchievementDisplayTitle, sortAchievementsForProfilePreview } from "../../features/coach/achievement-catalog";
import { createAchievements, type Achievement } from "../../features/coach/domain";
import { refreshProductAchievements } from "../../features/coach/refresh-achievements";
import { getLocalDateString } from "../../features/onboarding/domain";
import { createLogoutFlow } from "../../auth/logout-flow";
import { signOut } from "../../auth/session-manager";
import { PageLayout } from "../../layouts/page-layout";
import { useAppShare } from "../../hooks/use-app-share";
import { useAchievementStore } from "../../stores/achievement-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
import { useProfileStore } from "../../stores/profile-store";
import { useTabBarStore } from "../../stores/tab-bar-store";
import { refreshAndroidSmartReminders } from "../../features/smart-reminders/coordinator";
import { AndroidProfileOverview } from "./android-overview";
import "./android-profile.scss";

const isAndroidApp = process.env.TARO_APP_PLATFORM === "android";
const loginEntryPath = isAndroidApp ? "/pages/android-auth/index" : "/pages/auth-entry/index";
const goalKeys: Record<string, string> = { "增益增肌": "muscle_gain", "轻盈减脂": "fat_loss", "保持状态": "maintenance", "健康饮食": "performance" };

export default function ProfilePage() {
  useTranslation();
  useAppShare();
  const profile = useProfileStore();
  const meals = useMealStore();
  const achievements = useAchievementStore();
  const feedback = useFeedbackStore();
  const date = getLocalDateString();
  const list = achievements.achievements.length
    ? achievements.achievements
    : createAchievements(meals.meals, date);
  const summary = meals.getDailySummary(date);
  const proteinCompletion = summary.protein
    ? Math.min(100, Math.round((summary.consumed.protein / summary.protein) * 100))
    : 0;
  const unlockedAchievements = list.filter((achievement) => achievement.unlocked).length;
  const [activeModal, setActiveModal] = useState<"feedback" | "about" | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackMode, setFeedbackMode] = useState<"submit" | "history">("submit");
  const [feedbackItems, setFeedbackItems] = useState<ProductFeedbackItem[]>([]);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [unreadReplyCount, setUnreadReplyCount] = useState(0);
  const [weeklyReview, setWeeklyReview] = useState<ProductWeeklyReview | null>(null);
  const [milestoneJourney, setMilestoneJourney] = useState<ProductMilestoneJourney | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [profileMotion, setProfileMotion] = useState(false);
  const [accountError, setAccountError] = useState(false);
  const isPageScrollLocked = activeModal !== null
    || selectedAchievement !== null
    || achievements.manualAchievementCelebration !== null
    || achievements.achievementUnlocked !== null;
  const profileSyncVersion = useRef(0);
  const setTabBarVisible = useTabBarStore((state) => state.setVisible);
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);
  const showAchievementCelebration = useAchievementStore((state) => state.showAchievementCelebration);
  const logoutFlow = createLogoutFlow({
    signOut,
    openLogin: () => Taro.reLaunch({ url: loginEntryPath }),
  });

  useEffect(() => {
    if (activeModal || selectedAchievement) {
      setTabBarVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setTabBarVisible(true), bottomSheetExitDuration);
    return () => clearTimeout(timer);
  }, [activeModal, selectedAchievement, setTabBarVisible]);

  useEffect(() => () => setTabBarVisible(true), [setTabBarVisible]);

  useEffect(() => {
    if (isAndroidApp) return;
    void Promise.all([
      refreshProductAchievements(date),
      getMilestoneJourney().catch(() => null),
    ])
      .then(([, journey]) => {
        if (journey) setMilestoneJourney(journey);
      })
      .catch(() => undefined);
  }, [date]);

  const refreshFeedbackHistory = () =>
    getMyFeedback()
      .then((result) => {
        setFeedbackItems(result.items);
        setUnreadReplyCount(result.unreadReplyCount);
      })
      .catch(() => undefined);

  usePullDownRefresh(() => {
    if (isAndroidApp) {
      setRefreshVersion((version) => version + 1);
      syncProfileFromAccount();
      void refreshFeedbackHistory();
      void Taro.stopPullDownRefresh();
      return;
    }
    setRefreshing(true);
    void Promise.all([
      refreshFeedbackHistory(),
      refreshProductAchievements(date),
      getProductWeeklyReview(date, { preferFast: true }),
      getMilestoneJourney().catch(() => null),
    ])
      .then(([, , review, journey]) => {
        setWeeklyReview(review);
        if (journey) setMilestoneJourney(journey);
      })
      .finally(() => {
        setRefreshing(false);
        Taro.stopPullDownRefresh();
      });
  });

  // A page can remain mounted under native back-navigation. The version guard
  // prevents an earlier account request from restoring an outdated goal.
  const syncProfileFromAccount = () => {
    setAccountError(false);
    const requestVersion = profileSyncVersion.current + 1;
    profileSyncVersion.current = requestVersion;
    void getProductAccount()
      .then((account) => {
        if (requestVersion !== profileSyncVersion.current) return;
        const labels: Record<string, string> = {
          muscle_gain: "增益增肌",
          fat_loss: "轻盈减脂",
          maintain: "保持状态",
          performance: "健康饮食",
        };
        const realNickname =
          account.nickname && account.nickname !== "微信用户" ? account.nickname : null;
        const changes: {
          nickname?: string;
          avatarUrl?: string | null;
          weight?: number;
          goalLabel?: string;
        } = {};
        if (realNickname) changes.nickname = realNickname;
        if (account.avatarUrl) changes.avatarUrl = account.avatarUrl;
        if (account.weightKg != null) changes.weight = account.weightKg;
        if (account.goalType) changes.goalLabel = labels[account.goalType] ?? "增益增肌";
        if (Object.keys(changes).length > 0) {
          useProfileStore.getState().setProfile(changes);
        }
        const settings = account.settings;
        if (settings) {
          const store = useProfileStore.getState();
          if (settings.dietaryPattern !== undefined) {
            store.setSetting("dietaryPattern", settings.dietaryPattern);
          }
          if (Array.isArray(settings.foodAvoidances)) {
            store.setSetting("foodAvoidances", settings.foodAvoidances);
          }
          if (typeof settings.mealsPerDay === "number") {
            store.setSetting("mealsPerDay", settings.mealsPerDay);
          }
        }
      })
      .catch(() => { if (requestVersion === profileSyncVersion.current) setAccountError(true); });
  };

  useDidShow(() => {
    refreshFeedbackHistory();
    syncProfileFromAccount();
    void refreshAndroidSmartReminders();
    if (!isAndroidApp) void getProductWeeklyReview(date, { preferFast: true })
      .then(setWeeklyReview)
      .catch(() => undefined);
  });

  const openPage = (url: string) => void Taro.navigateTo({ url });
  const openCoach = () => {
    setActiveKey("coach");
    void Taro.switchTab({ url: "/pages/coach/index" });
  };
  const openMealRecords = () => {
    setActiveKey("meal-records");
    void Taro.switchTab({ url: "/pages/meal-records/index" });
  };
  const openMilestoneJourney = () => Taro.navigateTo({ url: "/pages/milestone-journey/index" });
  const submitFeedback = async () => {
    if (!feedbackDraft.trim()) {
      setFeedbackError(t("feedback.required"));
      return;
    }
    try {
      await submitProductFeedback(feedbackDraft.trim());
      setFeedbackDraft("");
      setFeedbackError(null);
      refreshFeedbackHistory();
      setActiveModal(null);
      setTimeout(() => {
        feedback.showModal({
          variant: "success",
          title: t("feedback.thanks"),
          description: t("feedback.receivedDescription"),
          primaryText: t("feedback.okay"),
          dismissible: false,
        });
      }, bottomSheetExitDuration);
    } catch {
      feedback.showModal({
        variant: "error",
        title: t("feedback.submitFailed"),
        description: t("feedback.submitFailedDescription"),
        primaryText: t("common.confirm"),
        dismissible: true,
      });
    }
  };
  const changeFeedbackMode = (nextMode: "submit" | "history") => {
    setFeedbackMode(nextMode);
    if (nextMode !== "history") return;
    const unreadIds = feedbackItems
      .filter((item) => item.adminReply && !item.replyReadAt)
      .map((item) => item.id);
    if (!unreadIds.length) return;
    void markFeedbackRepliesRead(unreadIds)
      .then(() => {
        setUnreadReplyCount(0);
        setFeedbackItems((items) =>
          items.map((item) =>
            unreadIds.includes(item.id) ? { ...item, replyReadAt: "read" } : item,
          ),
        );
      })
      .catch(() => undefined);
  };
  const openFeedback = () => {
    setFeedbackMode(feedbackItems.length ? "history" : "submit");
    setFeedbackError(null);
    setActiveModal("feedback");
  };
  const performLogout = () => {
    void logoutFlow
      .run()
      .catch(() => feedback.show({ message: t("profile.logoutFailed"), tone: "error" }));
  };
  const logout = () => {
    feedback.showModal({
      variant: "error",
      title: t("profile.logoutQuestion"),
      description: t("profile.logoutWarning"),
      primaryText: t("profile.logout"),
      secondaryText: t("common.cancel"),
      onPrimary: performLogout,
      dismissible: true,
    });
  };
  const openAchievement = (achievement: Achievement) => {
    if (achievement.unlocked) {
      showAchievementCelebration(achievement);
      return;
    }
    setSelectedAchievement(achievement);
  };

  return (
    <PageLayout
      title={t("profile.title")}
      activeTab="profile"
      hideNavigation
      showBrandHeader={!isAndroidApp}
      disablePageEnterAnimation={isAndroidApp}
      refreshing={refreshing}
      scrollLocked={isPageScrollLocked}
      className={`page-layout--profile${isAndroidApp ? ` page-layout--profile-android profile-stitch${profileMotion ? "" : " profile-stitch--reduced"}` : ""}`}
    >
      <View className="profile-rhythm">
        {isAndroidApp ? <AndroidProfileOverview
          key={profile.userId ?? "loading-profile"}
          profile={profile}
          refreshVersion={refreshVersion}
          openPage={openPage}
          openCoach={openCoach}
          openMealRecords={openMealRecords}
          openAchievement={openAchievement}
          onMotionChange={setProfileMotion}
          accountError={accountError}
          retryAccount={syncProfileFromAccount}
        /> : <>
        <View ariaLabel={t("profile.editProfile")} onClick={() => openPage("/pages/profile-edit/index")}>
          <AppCard tone="dark" className="profile-hero profile-rhythm__identity">
            <Avatar
              label={profile.profile.nickname.slice(0, 1).toUpperCase()}
              src={profile.profile.avatarUrl}
              size="large"
            />
            <View className="profile-hero__copy">
              <Text className="profile-hero__name">{profile.profile.nickname}</Text>
              <Text className="profile-hero__goal">
                {goalKeys[profile.profile.goalLabel] ? t(`onboarding.goals.${goalKeys[profile.profile.goalLabel]}.title`) : profile.profile.goalLabel} · {t("profile.currentWeight", { weight: profile.profile.weight })}
              </Text>
              <Badge tone="success">{t("profile.movingForward")}</Badge>
            </View>
          </AppCard>
        </View>

        <View className="card-grid profile-rhythm__stats">
          <View onClick={() => openPage("/pages/goal-adjust/index")}>
            <StatisticCard
              label={t("profile.targetCalories")}
              value={`${profile.profile.targetCalories}`}
              hint={t("profile.adjustable")}
            />
          </View>
          <View onClick={openCoach}>
            <StatisticCard
              label={t("profile.proteinCompletion")}
              value={`${proteinCompletion}%`}
              hint={t("profile.today")}
              tone="sage"
            />
          </View>
          <View onClick={openMealRecords}>
            <StatisticCard
              label={t("profile.loggedMeals")}
              value={`${weeklyReview?.recordedMeals ?? meals.meals.length}`}
              hint={t("profile.thisWeek")}
              tone="beige"
            />
          </View>
          <View onClick={() => void openMilestoneJourney()}>
            <StatisticCard
              label={t("profile.journey")}
              value={t("profile.days", { count: milestoneJourney?.currentStreakDays ?? 0 })}
              hint={t("profile.streak")}
            />
          </View>
        </View>

        <View className="profile-rhythm__section-head">
          <Text>{t("profile.achievements")}</Text>
          <Text onClick={() => openPage("/pages/achievements/index")}>
            {unlockedAchievements}/{list.length} ›
          </Text>
        </View>
        <View className="profile-rhythm__achievement-row">
          {sortAchievementsForProfilePreview(list)
            .slice(0, 3)
            .map((achievement) => {
              const title = getAchievementDisplayTitle(achievement.title, (key) => t(key));
              return (
                <View
                  className={`profile-rhythm__achievement ${achievement.unlocked ? "" : "profile-rhythm__achievement--locked"}`}
                  key={achievement.id}
                  onClick={() => openAchievement(achievement)}
                  ariaLabel={title}
                >
                  <NordicIcon
                    name={getAchievementIcon(achievement)}
                    size={22}
                    ariaLabel={title}
                  />
                  <Text>{title}</Text>
                </View>
              );
            })}
        </View>

        <View
          className="profile-rhythm__weekly-review"
          ariaLabel={t("profile.weeklySummary")}
          onClick={() => openPage("/pages/weekly-review/index")}
        >
          <View className="profile-rhythm__weekly-copy">
            <Text className="profile-rhythm__weekly-title">{t("weekly.title")}</Text>
            <Text className="profile-rhythm__weekly-description">{t("profile.weeklyDescription")}</Text>
          </View>
          <View className="profile-rhythm__weekly-score">
            <Text className="profile-rhythm__weekly-score-label">{t("profile.rhythm")}</Text>
            <Text className="profile-rhythm__weekly-score-value">{weeklyReview?.score ?? proteinCompletion}</Text>
            <Text className="profile-rhythm__weekly-score-suffix">{t("profile.points")}</Text>
          </View>
        </View>

        </>}
        <View className="profile-rhythm__entry-sections">
          <View className="profile-rhythm__settings-section">
            <Text className="profile-rhythm__settings-label">{t("profile.foodManagement")}</Text>
            <View className="profile-rhythm__settings-group">
              {isAndroidApp ? (
                <View onClick={() => openPage("/pages/smart-reminder-settings/index")}>
                  <ListItem icon={<NordicIcon name="bell" size={20} ariaLabel={t("profile.reminders")} />} title={t("profile.reminders")} description={t("profile.remindersDescription")} />
                </View>
              ) : null}
              <View onClick={() => openPage("/pages/frequent-meals/index")}>
                <ListItem icon={<NordicIcon name="bookmark" size={20} ariaLabel={t("profile.favorites")} />} title={t("profile.favorites")} description={t("profile.favoritesDescription")} />
              </View>
              <View onClick={() => openPage("/pages/body-profile/index?from=settings&entry=1")}>
                <ListItem
                  icon={<NordicIcon name="ruler" size={20} ariaLabel={t("profile.nutrition")} />}
                  title={t("profile.nutrition")}
                  description={t("profile.nutritionDescription")}
                />
              </View>
            </View>
          </View>

          <View className="profile-rhythm__settings-section">
            <Text className="profile-rhythm__settings-label">{t("profile.helpInformation")}</Text>
            <View className="profile-rhythm__settings-group">
              <View onClick={openFeedback}>
                <ListItem
                  icon={<NordicIcon name="message-circle" size={20} ariaLabel={t("profile.feedback")} />}
                  title={
                    <View className="profile-feedback-title">
                      <Text>{t("profile.feedback")}</Text>
                      {unreadReplyCount > 0 ? (
                        <View className="profile-feedback-title__bell">
                          <NordicIcon name="bell" size={16} ariaLabel={t("profile.newFeedbackReply")} />
                        </View>
                      ) : null}
                    </View>
                  }
                  description={t("profile.feedbackDescription")}
                  trailing="›"
                />
              </View>
              <View onClick={() => setActiveModal("about")}>
                <ListItem
                  icon={<NordicIcon name="info" size={20} ariaLabel={t("profile.about")} />}
                  title={t("profile.about")}
                  description={t("profile.aboutDescription")}
                />
              </View>
              <View onClick={() => openPage("/pages/privacy-policy/index")}>
                <ListItem
                  icon={<NordicIcon name="shield-check" size={20} ariaLabel={t("profile.privacy")} />}
                  title={t("profile.privacy")}
                  description={t("profile.privacyDescription")}
                />
              </View>
              <LanguageSettings />
            </View>
          </View>

          <View className="profile-rhythm__logout" ariaLabel={t("profile.logout")} onClick={logout}>
            <NordicIcon name="log-out" size={20} ariaLabel={t("profile.logout")} />
            <View className="profile-rhythm__logout-copy">
              <Text className="profile-rhythm__logout-title">{t("profile.logout")}</Text>
              <Text className="profile-rhythm__logout-description">{t("profile.logoutDescription")}</Text>
            </View>
          </View>
        </View>
        {isAndroidApp && <Text className="profile-stitch__footer">Nordic Nutri AI · Mindful Eating Made Gentle</Text>}
      </View>

      <AchievementDetailSheet
        achievement={selectedAchievement}
        onDismiss={() => setSelectedAchievement(null)}
      />

      <BottomSheet
        open={activeModal === "feedback"}
        className="profile-sheet profile-sheet--fixed"
        onDismiss={() => setActiveModal(null)}
        nativeInput
        lockScroll
      >
        <View className="profile-sheet__content">
          <View className="profile-sheet__header">
            <Text className="profile-modal__title">{t("profile.feedback")}</Text>
            <View
              className="profile-sheet__close"
              ariaLabel={t("profile.closeFeedback")}
              onClick={() => setActiveModal(null)}
            >
              <NordicIcon name="x" size={20} ariaLabel={t("common.close")} />
            </View>
          </View>
          <View className="profile-feedback-tabs">
            <View
              className={`profile-feedback-tab ${feedbackMode === "submit" ? "profile-feedback-tab--active" : ""}`}
              onClick={() => changeFeedbackMode("submit")}
            >
              <Text>{t("feedback.submit")}</Text>
            </View>
            <View
              className={`profile-feedback-tab ${feedbackMode === "history" ? "profile-feedback-tab--active" : ""}`}
              onClick={() => changeFeedbackMode("history")}
            >
              <Text>{t("feedback.history")}</Text>
            </View>
          </View>
          {feedbackMode === "submit" ? (
            <>
              <Text className="profile-modal__lead">
                {t("feedback.lead")}</Text>
              <Textarea
                className="profile-modal__input"
                value={feedbackDraft}
                placeholder={t("feedback.placeholder")}
                maxlength={2000}
                adjustPosition
                cursorSpacing={20}
                disableDefaultPadding
                showConfirmBar={false}
                onTouchStart={(event) => event.stopPropagation()}
                onInput={(event) => {
                  setFeedbackDraft(event.detail.value);
                  if (feedbackError) setFeedbackError(null);
                }}
              />
              {feedbackError ? <Text className="form-field__error">{feedbackError}</Text> : null}
              <Text className="profile-modal__hint">
                {t("feedback.hint")}</Text>
              <View className="profile-sheet__action">
                <AppButton size="medium" onClick={() => void submitFeedback()}>
                  {t("feedback.submit")}</AppButton>
              </View>
            </>
          ) : (
            <View className="profile-feedback-list">
              {feedbackItems.length ? (
                feedbackItems.map((item) => (
                  <View className="profile-feedback-card" key={item.id}>
                    <View className="profile-feedback-card__head">
                      <Text className="profile-feedback-status">
                        {
                          {
                            new: t("feedback.received"),
                            reviewing: t("feedback.reviewing"),
                            resolved: t("feedback.resolved"),
                            closed: t("feedback.closed"),
                          }[item.status]
                        }
                      </Text>
                      <Text>{item.createdAt.slice(0, 10)}</Text>
                    </View>
                    <Text className="profile-feedback-label">{item.category === "recognition" ? t("feedback.recognition") : t("feedback.yours")}</Text>
                    <Text className="profile-feedback-card__content">{item.content}</Text>
                    {item.adminReply ? (
                      <View className="profile-feedback-reply">
                        <Text className="profile-feedback-label">{t("feedback.reply")}</Text>
                        <Text>{item.adminReply}</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <View className="profile-feedback-empty">
                  <Text>{t("feedback.empty")}</Text>
                  <Text>{t("feedback.emptyDescription")}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        open={activeModal === "about"}
        className="profile-sheet profile-sheet--info profile-sheet--fixed"
        onDismiss={() => setActiveModal(null)}
        lockScroll
      >
        <View className="profile-sheet__content">
          <View className="profile-sheet__header">
            <Text className="profile-modal__title">{t("profile.about")}</Text>
          </View>
          <Text className="profile-modal__lead">
            {t("profile.aboutLead")}
          </Text>
          <View className="profile-modal__notice">
            <Text>{t("profile.about1")}</Text>
            <Text>{t("profile.about2")}</Text>
            <Text>{t("profile.about3")}</Text>
            <Text>{t("profile.about4")}</Text>
          </View>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
