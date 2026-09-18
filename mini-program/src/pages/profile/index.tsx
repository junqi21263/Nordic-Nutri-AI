import { Text, Textarea, View } from "@tarojs/components";
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
import { sortAchievementsForProfilePreview } from "../../features/coach/achievement-catalog";
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

export default function ProfilePage() {
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
  const [profileMotionOff, setProfileMotionOff] = useState(false);
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
      setFeedbackError("请先写下你的问题或建议");
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
          title: "感谢你的反馈",
          description: "我们已收到，会用它持续改进体验。",
          primaryText: "好的",
          dismissible: false,
        });
      }, bottomSheetExitDuration);
    } catch {
      feedback.showModal({
        variant: "error",
        title: "反馈提交失败",
        description: "内容已保留，请稍后重试。",
        primaryText: "知道了",
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
      .catch(() => feedback.show({ message: "退出登录失败，请稍后重试", tone: "error" }));
  };
  const logout = () => {
    feedback.showModal({
      variant: "error",
      title: "退出登录？",
      description: "仅退出当前设备，不会删除你的饮食记录。",
      primaryText: "退出登录",
      secondaryText: "取消",
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
      title="个人中心"
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
          motionOff={profileMotionOff}
          accountError={accountError}
          retryAccount={syncProfileFromAccount}
        /> : <>
        <View ariaLabel="编辑个人资料" onClick={() => openPage("/pages/profile-edit/index")}>
          <AppCard tone="dark" className="profile-hero profile-rhythm__identity">
            <Avatar
              label={profile.profile.nickname.slice(0, 1).toUpperCase()}
              src={profile.profile.avatarUrl}
              size="large"
            />
            <View className="profile-hero__copy">
              <Text className="profile-hero__name">{profile.profile.nickname}</Text>
              <Text className="profile-hero__goal">
                {profile.profile.goalLabel} · 当前 {profile.profile.weight} kg
              </Text>
              <Badge tone="success">稳定前进中</Badge>
            </View>
          </AppCard>
        </View>

        <View className="card-grid profile-rhythm__stats">
          <View onClick={() => openPage("/pages/goal-adjust/index")}>
            <StatisticCard
              label="目标热量"
              value={`${profile.profile.targetCalories}`}
              hint="kcal · 可调整"
            />
          </View>
          <View onClick={openCoach}>
            <StatisticCard
              label="蛋白完成度"
              value={`${proteinCompletion}%`}
              hint="今日"
              tone="sage"
            />
          </View>
          <View onClick={openMealRecords}>
            <StatisticCard
              label="已记录餐次"
              value={`${weeklyReview?.recordedMeals ?? meals.meals.length}`}
              hint="本周"
              tone="beige"
            />
          </View>
          <View onClick={() => void openMilestoneJourney()}>
            <StatisticCard
              label="我的旅程"
              value={`${milestoneJourney?.currentStreakDays ?? 0} 天`}
              hint="连续记录"
            />
          </View>
        </View>

        <View className="profile-rhythm__section-head">
          <Text>成就</Text>
          <Text onClick={() => openPage("/pages/achievements/index")}>
            {unlockedAchievements}/{list.length} ›
          </Text>
        </View>
        <View className="profile-rhythm__achievement-row">
          {sortAchievementsForProfilePreview(list)
            .slice(0, 3)
            .map((achievement) => (
              <View
                className={`profile-rhythm__achievement ${achievement.unlocked ? "" : "profile-rhythm__achievement--locked"}`}
                key={achievement.id}
                onClick={() => openAchievement(achievement)}
              >
                <NordicIcon
                  name={getAchievementIcon(achievement)}
                  size={22}
                  ariaLabel={achievement.title}
                />
                <Text>{achievement.title}</Text>
              </View>
            ))}
        </View>

        <View
          className="profile-rhythm__weekly-review"
          ariaLabel="查看本周总结"
          onClick={() => openPage("/pages/weekly-review/index")}
        >
          <View className="profile-rhythm__weekly-copy">
            <Text className="profile-rhythm__weekly-title">本周回顾</Text>
            <Text className="profile-rhythm__weekly-description">保持记录，稳步靠近增肌目标。</Text>
          </View>
          <View className="profile-rhythm__weekly-score">
            <Text className="profile-rhythm__weekly-score-label">营养节奏</Text>
            <Text className="profile-rhythm__weekly-score-value">{weeklyReview?.score ?? proteinCompletion}</Text>
            <Text className="profile-rhythm__weekly-score-suffix">分 ›</Text>
          </View>
        </View>

        </>}
        <View className="profile-rhythm__entry-sections">
          <View className="profile-rhythm__settings-section">
            <Text className="profile-rhythm__settings-label">饮食管理</Text>
            <View className="profile-rhythm__settings-group">
              {isAndroidApp ? (
                <View onClick={() => setProfileMotionOff(!profileMotionOff)}>
                  <ListItem icon={<NordicIcon name="sparkles" size={20} ariaLabel="页面动效" />} title="页面动效" description={profileMotionOff ? "已关闭，点击开启" : "已开启，点击关闭"} trailing={profileMotionOff ? "关" : "开"} />
                </View>
              ) : null}
              {isAndroidApp ? (
                <View onClick={() => openPage("/pages/smart-reminder-settings/index")}>
                  <ListItem icon={<NordicIcon name="bell" size={20} ariaLabel="记录提醒" />} title="记录提醒" description="按餐次设置轻量的本地提醒" />
                </View>
              ) : null}
              <View onClick={() => openPage("/pages/frequent-meals/index")}>
                <ListItem icon={<NordicIcon name="bookmark" size={20} ariaLabel="我的常吃" />} title="我的常吃" description="保存熟悉的一餐，下次一键记录" />
              </View>
              <View onClick={() => openPage("/pages/body-profile/index?from=settings&entry=1")}>
                <ListItem
                  icon={<NordicIcon name="ruler" size={20} ariaLabel="营养档案" />}
                  title="营养档案"
                  description="身体数据、饮食偏好与忌口"
                />
              </View>
            </View>
          </View>

          <View className="profile-rhythm__settings-section">
            <Text className="profile-rhythm__settings-label">帮助与信息</Text>
            <View className="profile-rhythm__settings-group">
              <View onClick={openFeedback}>
                <ListItem
                  icon={<NordicIcon name="message-circle" size={20} ariaLabel="反馈与帮助" />}
                  title={
                    <View className="profile-feedback-title">
                      <Text>反馈与帮助</Text>
                      {unreadReplyCount > 0 ? (
                        <View className="profile-feedback-title__bell">
                          <NordicIcon name="bell" size={16} ariaLabel="有新的反馈回复" />
                        </View>
                      ) : null}
                    </View>
                  }
                  description="告诉我们你的想法"
                  trailing="›"
                />
              </View>
              <View onClick={() => setActiveModal("about")}>
                <ListItem
                  icon={<NordicIcon name="info" size={20} ariaLabel="关于我们" />}
                  title="关于我们"
                  description="产品介绍与使用说明"
                />
              </View>
              <View onClick={() => openPage("/pages/privacy-policy/index")}>
                <ListItem
                  icon={<NordicIcon name="shield-check" size={20} ariaLabel="隐私政策与免责声明" />}
                  title="隐私政策与免责声明"
                  description="数据说明与账号注销"
                />
              </View>
            </View>
          </View>

          <View className="profile-rhythm__settings-section">
            <Text className="profile-rhythm__settings-label">和朋友一起</Text>
            <View
              className="profile-rhythm__recommend-card"
              ariaLabel="推荐好友"
              onClick={() => openPage("/pages/recommend-friends/index")}
            >
              <View className="profile-rhythm__recommend-icon">
                <NordicIcon name="share" size={22} ariaLabel="推荐好友" />
              </View>
              <View className="profile-rhythm__recommend-copy">
                <Text className="profile-rhythm__recommend-title">推荐好友</Text>
                <Text className="profile-rhythm__recommend-description">分享海报，邀请朋友一起开始</Text>
              </View>
              <Text className="profile-rhythm__recommend-trailing">›</Text>
            </View>
          </View>

          <View className="profile-rhythm__logout" ariaLabel="退出登录" onClick={logout}>
            <NordicIcon name="log-out" size={20} ariaLabel="退出登录" />
            <View className="profile-rhythm__logout-copy">
              <Text className="profile-rhythm__logout-title">退出登录</Text>
              <Text className="profile-rhythm__logout-description">仅退出当前设备</Text>
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
            <Text className="profile-modal__title">反馈与帮助</Text>
            <View
              className="profile-sheet__close"
              ariaLabel="关闭反馈与帮助"
              onClick={() => setActiveModal(null)}
            >
              <NordicIcon name="x" size={20} ariaLabel="关闭" />
            </View>
          </View>
          <View className="profile-feedback-tabs">
            <View
              className={`profile-feedback-tab ${feedbackMode === "submit" ? "profile-feedback-tab--active" : ""}`}
              onClick={() => changeFeedbackMode("submit")}
            >
              <Text>提交反馈</Text>
            </View>
            <View
              className={`profile-feedback-tab ${feedbackMode === "history" ? "profile-feedback-tab--active" : ""}`}
              onClick={() => changeFeedbackMode("history")}
            >
              <Text>我的反馈</Text>
            </View>
          </View>
          {feedbackMode === "submit" ? (
            <>
              <Text className="profile-modal__lead">
                告诉我们哪里不顺手，或你希望下一步看到什么。
              </Text>
              <Textarea
                className="profile-modal__input"
                value={feedbackDraft}
                placeholder="例如：我希望回顾中能看到每餐的蛋白变化"
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
                提交后将安全保存，用于定位问题和改进体验。
              </Text>
              <View className="profile-sheet__action">
                <AppButton size="medium" onClick={() => void submitFeedback()}>
                  提交反馈
                </AppButton>
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
                            new: "已收到",
                            reviewing: "处理中",
                            resolved: "已回复",
                            closed: "已关闭",
                          }[item.status]
                        }
                      </Text>
                      <Text>{item.createdAt.slice(0, 10)}</Text>
                    </View>
                    <Text className="profile-feedback-label">{item.category === "recognition" ? "识别纠错反馈" : "你的反馈"}</Text>
                    <Text className="profile-feedback-card__content">{item.content}</Text>
                    {item.adminReply ? (
                      <View className="profile-feedback-reply">
                        <Text className="profile-feedback-label">我们的回复</Text>
                        <Text>{item.adminReply}</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <View className="profile-feedback-empty">
                  <Text>暂无反馈记录</Text>
                  <Text>你提交的反馈会在这里显示处理进度和回复。</Text>
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
            <Text className="profile-modal__title">关于我们</Text>
          </View>
          <Text className="profile-modal__lead">
            Nordic Nutri AI 帮助你轻松看见、理解并记录每一餐。
          </Text>
          <View className="profile-modal__notice">
            <Text>
              面向健身与健康管理用户，把拍照识别、食物库、目标进度、餐次回顾与每日建议放在同一套轻松、可持续的节奏里。
            </Text>
            <Text>
              当前支持微信登录与云端同步、饮食记录与周回顾、目标调整、标准食物库浏览，以及营养教练参考建议。
            </Text>
            <Text>
              营养建议仅供日常参考，不构成医疗诊断或治疗建议；如有健康问题，请咨询专业人士。
            </Text>
            <Text>
              产品持续迭代中，欢迎通过「反馈与帮助」告诉我们哪里不顺手，或你希望下一步看到什么。
            </Text>
          </View>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
