import { Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { Avatar } from "../../components/avatar";
import { Badge } from "../../components/badge";
import { BottomSheet, bottomSheetExitDuration } from "../../components/bottom-sheet";
import { ListItem } from "../../components/list-item";
import { NordicIcon } from "../../components/nordic-icon";
import { StatisticCard } from "../../components/statistic-card";
import { createAchievements } from "../../features/coach/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useAchievementStore } from "../../stores/achievement-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
import { useProfileStore } from "../../stores/profile-store";
import { useTabBarStore } from "../../stores/tab-bar-store";

export default function ProfilePage() {
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
  const [activeModal, setActiveModal] = useState<"privacy" | "feedback" | "about" | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const setTabBarVisible = useTabBarStore((state) => state.setVisible);
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);

  useEffect(() => {
    if (activeModal) {
      setTabBarVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setTabBarVisible(true), bottomSheetExitDuration);
    return () => clearTimeout(timer);
  }, [activeModal, setTabBarVisible]);

  useEffect(() => () => setTabBarVisible(true), [setTabBarVisible]);

  const showNotice = (message: string) => feedback.show({ message, tone: "success" });
  const openPage = (url: string) => void Taro.navigateTo({ url });
  const openCoach = () => {
    setActiveKey("coach");
    void Taro.switchTab({ url: "/pages/coach/index" });
  };
  const openMealRecords = () => {
    setActiveKey("meal-records");
    void Taro.switchTab({ url: "/pages/meal-records/index" });
  };
  const submitFeedback = () => {
    if (!feedbackDraft.trim()) {
      feedback.show({ message: "请先写下你的问题或建议", tone: "error" });
      return;
    }
    setFeedbackDraft("");
    setActiveModal(null);
    showNotice("感谢你的反馈");
  };

  return (
    <PageLayout
      title="个人中心"
      activeTab="profile"
      hideNavigation
      className="page-layout--profile"
    >
      <View className="profile-page-title"><Text>个人中心</Text></View>
      <View className="profile-rhythm">
        <View ariaLabel="编辑个人资料" onClick={() => openPage("/pages/profile-edit/index")}>
          <AppCard tone="dark" className="profile-hero profile-rhythm__identity">
            <Avatar label={profile.profile.nickname.slice(0, 1).toUpperCase()} size="large" />
            <View>
              <Text className="profile-hero__name">{profile.profile.nickname}</Text>
              <Text className="profile-hero__goal">
                {profile.profile.goalLabel} · 当前 {profile.profile.weight} kg
              </Text>
              <Badge tone="success">稳定前进中</Badge>
            </View>
          </AppCard>
        </View>

        <View className="card-grid profile-rhythm__stats">
          <StatisticCard label="目标热量" value={`${profile.profile.targetCalories}`} hint="kcal" />
          <View onClick={openCoach}>
            <StatisticCard label="蛋白完成度" value={`${proteinCompletion}%`} hint="今日" tone="sage" />
          </View>
          <View onClick={openMealRecords}>
            <StatisticCard label="已记录餐次" value={`${meals.meals.length}`} hint="本地记录" tone="beige" />
          </View>
          <StatisticCard label="本周坚持" value="4 天" hint="保持节奏" />
        </View>

        <View className="profile-rhythm__section-head">
          <Text>成就</Text>
          <Text onClick={() => openPage("/pages/achievements/index")}>{unlockedAchievements}/{list.length} ›</Text>
        </View>
        <View className="profile-rhythm__achievement-row">
          {list.slice(0, 3).map((achievement) => (
            <View
              className={`profile-rhythm__achievement ${achievement.unlocked ? "" : "profile-rhythm__achievement--locked"}`}
              key={achievement.id}
            >
              <NordicIcon name="sparkles" size={22} ariaLabel={achievement.title} />
              <Text>{achievement.title}</Text>
            </View>
          ))}
        </View>

        <View
          className="profile-rhythm__weekly-review"
          ariaLabel="查看本周总结"
          onClick={() => openPage("/pages/weekly-review/index")}
        >
          <View>
            <Text>本周回顾</Text>
            <Text>保持记录，稳步靠近增肌目标。</Text>
          </View>
          <View className="profile-rhythm__weekly-score">
            <Text>营养节奏</Text>
            <Text>{proteinCompletion}</Text>
            <Text>分 ›</Text>
          </View>
        </View>

        <View className="profile-rhythm__settings-group">
          <View onClick={() => setActiveModal("privacy")}>
            <ListItem icon={<NordicIcon name="check" size={20} ariaLabel="隐私与数据" />} title="隐私与数据" description="本地体验说明" />
          </View>
          <View onClick={() => setActiveModal("feedback")}>
            <ListItem icon={<NordicIcon name="heart" size={20} ariaLabel="反馈与帮助" />} title="反馈与帮助" description="告诉我们你的想法" />
          </View>
          <View onClick={() => setActiveModal("about")}>
            <ListItem icon={<NordicIcon name="user-round" size={20} ariaLabel="关于我们" />} title="关于我们" description="Nordic Nutri AI 本地体验版" />
          </View>
        </View>
      </View>

      <BottomSheet open={activeModal === "privacy"} className="profile-sheet" onDismiss={() => setActiveModal(null)}>
        <View className="profile-sheet__content">
          <View className="profile-sheet__header">
            <Text className="profile-modal__title">隐私与数据</Text>
            <View className="profile-sheet__close" ariaLabel="关闭隐私与数据" onClick={() => setActiveModal(null)}>
              <NordicIcon name="x" size={20} ariaLabel="关闭" />
            </View>
          </View>
          <Text className="profile-modal__lead">你的记录，应该由你清楚掌握。</Text>
          <View className="profile-modal__notice">
            <Text>数据仅保留在当前设备，不会在当前体验版中上传、同步或共享。</Text>
            <Text>如需移除已有记录，可通过微信小程序设置清理本地缓存。</Text>
          </View>
          <View className="profile-sheet__action">
            <AppButton size="medium" onClick={() => setActiveModal(null)}>知道了</AppButton>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet open={activeModal === "feedback"} className="profile-sheet" onDismiss={() => setActiveModal(null)}>
        <View className="profile-sheet__content">
          <View className="profile-sheet__header">
            <Text className="profile-modal__title">反馈与帮助</Text>
            <View className="profile-sheet__close" ariaLabel="关闭反馈与帮助" onClick={() => setActiveModal(null)}>
              <NordicIcon name="x" size={20} ariaLabel="关闭" />
            </View>
          </View>
          <Text className="profile-modal__lead">告诉我们哪里不顺手，或你希望下一步看到什么。</Text>
          <Textarea
            className="profile-modal__input"
            value={feedbackDraft}
            placeholder="例如：我希望回顾中能看到每餐的蛋白变化"
            maxlength={120}
            autoHeight
            onInput={(event) => setFeedbackDraft(event.detail.value)}
          />
          <Text className="profile-modal__hint">反馈仅保存在本次本地体验中，不会上传。</Text>
          <View className="profile-sheet__action">
            <AppButton size="medium" onClick={submitFeedback}>提交反馈</AppButton>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet open={activeModal === "about"} className="profile-sheet" onDismiss={() => setActiveModal(null)}>
        <View className="profile-sheet__content">
          <View className="profile-sheet__header">
            <Text className="profile-modal__title">关于我们</Text>
            <View className="profile-sheet__close" ariaLabel="关闭关于我们" onClick={() => setActiveModal(null)}>
              <NordicIcon name="x" size={20} ariaLabel="关闭" />
            </View>
          </View>
          <Text className="profile-modal__lead">Nordic Nutri AI 是一款本地体验中的营养记录工具。</Text>
          <View className="profile-modal__notice">
            <Text>我们希望把饮食记录、目标进度和每日建议放在一个轻松、可持续的节奏里。</Text>
            <Text>当前版本聚焦本地记录与界面体验，不提供账号、云端同步或医疗建议。</Text>
          </View>
          <View className="profile-sheet__action">
            <AppButton size="medium" onClick={() => setActiveModal(null)}>知道了</AppButton>
          </View>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
