import { Image, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { ErrorState } from "../../components/error-state";
import { MacroProgress } from "../../components/macro-progress";
import { NordicIcon } from "../../components/nordic-icon";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Modal } from "../../components/modal";
import { getMealNutrition, getMealScore } from "../../features/meals/domain";
import {
  deleteProductMeal,
  getProductMeal,
  getProductMeals,
  updateProductMeal,
} from "../../api/meal-data-api";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import mealBowlImage from "../../assets/meal-bowl.svg";
import mealOatsImage from "../../assets/meal-oats.svg";
import mealSalmonImage from "../../assets/meal-salmon.svg";

const mealImages = {
  bowl: mealBowlImage,
  oats: mealOatsImage,
  salmon: mealSalmonImage,
};
const scoreCopy = {
  A: {
    label: "优秀搭配",
    summary: "蛋白质充足，脂肪控制得当。",
    reasons: ["蛋白质达到一餐建议量", "脂肪没有超过单餐建议量"],
  },
  B: {
    label: "均衡表现",
    summary: "整体营养不错，还可进一步优化搭配。",
    reasons: ["蛋白质达到基础建议量", "可结合当天剩余目标调整份量"],
  },
  C: {
    label: "可再优化",
    summary: "建议补充优质蛋白，让这一餐更均衡。",
    reasons: ["蛋白质低于一餐建议量", "搭配一份优质蛋白会更完整"],
  },
};

export default function MealDetailPage() {
  const router = useRouter();
  const store = useMealStore();
  const portion = usePortionDraftStore();
  const feedback = useFeedbackStore();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<"score" | "insight" | null>(null);
  const [remoteMeal, setRemoteMeal] = useState<ReturnType<typeof store.getMealById>>(undefined);
  const storedMeal = store.getMealById(router.params.id);
  const meal = remoteMeal ?? storedMeal;
  useEffect(() => {
    if (!router.params.id) return;
    let cancelled = false;
    const refresh = () =>
      getProductMeal(router.params.id!)
        .then((result) => {
          if (cancelled || !result) return;
          setRemoteMeal(result);
          if (store.getMealById(result.id)) store.updateMeal(result.id, result);
          else store.addMeal(result);
          return result;
        })
        .catch(() => undefined);

    void refresh().then((result) => {
      if (cancelled || !result) return;
      const pending = !result.insight || result.insight.includes("正在整理");
      if (!pending) return;
      // Background insight generation may finish shortly after the fast response.
      setTimeout(() => {
        if (!cancelled) void refresh();
      }, 2500);
    });
    return () => {
      cancelled = true;
    };
  }, [router.params.id, store.addMeal, store.getMealById, store.updateMeal]);
  if (!meal)
    return (
      <PageLayout
        title="餐次详情"
        subtitle="找不到这条云端记录。"
        eyebrow="饮食记录"
        showTabs={false}
        leading="‹"
        onLeadingClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
      >
        <ErrorState title="餐次不存在" description="它可能已被删除，或链接已经失效。" />
        <AppButton
          size="large"
          onClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
        >
          返回饮食记录
        </AppButton>
      </PageLayout>
    );
  const nutrition = getMealNutrition(meal);
  const score = getMealScore(meal);
  const scoreDetail = scoreCopy[score];
  const macros = [
    { label: "蛋白质", target: 60, tone: undefined, value: nutrition.protein },
    { label: "碳水", target: 90, tone: "carbs" as const, value: nutrition.carbs },
    { label: "脂肪", target: 25, tone: "fat" as const, value: nutrition.fat },
  ];
  const heroImage = meal.imageUrl || (meal.imageKey ? mealImages[meal.imageKey] : mealBowlImage);
  const previewImage = () => Taro.previewImage({ current: heroImage, urls: [heroImage] });
  const edit = () => {
    store.setEditingMealId(meal.id);
    portion.startMealEdit(meal);
    Taro.navigateTo({ url: `/pages/portion-adjustment/index?id=${meal.id}` });
  };
  const remove = async () => {
    try {
      const result = await deleteProductMeal(meal.id);
      if (!result.deleted) throw new Error("Meal not found");
      store.replaceRemoteMeals(await getProductMeals(meal.date), meal.date);
      feedback.show({ message: "餐次已删除并同步", tone: "success" });
      Taro.switchTab({ url: "/pages/meal-records/index" });
    } catch {
      feedback.show({ message: "删除失败，请稍后重试", tone: "error" });
    }
  };
  const toggleFavorite = async () => {
    const nextFavorite = !meal.favorite;
    try {
      const saved = await updateProductMeal(meal.id, { isFavorite: nextFavorite });
      if (!saved) throw new Error("Meal not found");
      // Detail UI prefers remoteMeal over the store — keep both in sync.
      setRemoteMeal(saved);
      if (store.getMealById(saved.id)) store.updateMeal(saved.id, saved);
      else store.addMeal(saved);
      feedback.show({
        message: nextFavorite ? "已加入收藏，可在「记录」筛选里查看" : "已取消收藏",
        tone: "success",
      });
    } catch {
      feedback.show({ message: "收藏状态更新失败，请稍后重试", tone: "error" });
    }
  };
  return (
    <PageLayout
      title="餐食详情"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--meal-detail"
    >
      <View className="meal-detail-page">
        <View className="meal-detail-page__heading">
          <Text className="meal-detail-page__meal-title">{meal.title}</Text>
          <Text className="meal-detail-page__meta">
            {meal.date} · {meal.time}
          </Text>
        </View>
        <AppCard tone="beige" className="meal-detail-page__hero">
          <View className="meal-detail-page__hero-visual">
            <View
              className="meal-detail-page__hero-image-hit"
              ariaLabel="查看原始餐食照片"
              onClick={previewImage}
            >
              <Image className="meal-detail-page__hero-image" mode="aspectFill" src={heroImage} />
            </View>
            <View
              className="meal-detail-page__score-badge"
              ariaLabel="查看本餐评分依据"
              onClick={() => setDetailModal("score")}
            >
              <View className="meal-detail-page__score-grade">
                <Text>{score}</Text>
              </View>
              <Text className="meal-detail-page__score-badge-label">{scoreDetail.label}</Text>
            </View>
            <View
              className="meal-detail-page__image-preview-hint"
              ariaLabel="查看原始餐食照片"
              onClick={previewImage}
            >
              <Text>查看原图</Text>
            </View>
          </View>
          <View className="meal-detail-page__hero-body">
            <Text className="meal-detail-page__calories">
              {nutrition.calories}
              <Text>kcal</Text>
            </Text>
            <View className="meal-detail-page__hero-macros">
              <View className="meal-detail-page__hero-macro-chip">
                <Text className="meal-detail-page__hero-macro-value">{nutrition.protein}g</Text>
                <Text className="meal-detail-page__hero-macro-label">蛋白质</Text>
              </View>
              <View className="meal-detail-page__hero-macro-chip">
                <Text className="meal-detail-page__hero-macro-value">{nutrition.carbs}g</Text>
                <Text className="meal-detail-page__hero-macro-label">碳水</Text>
              </View>
              <View className="meal-detail-page__hero-macro-chip">
                <Text className="meal-detail-page__hero-macro-value">{nutrition.fat}g</Text>
                <Text className="meal-detail-page__hero-macro-label">脂肪</Text>
              </View>
            </View>
          </View>
          <View
            className="meal-detail-page__score-footer"
            ariaLabel="查看本餐评分依据"
            onClick={() => setDetailModal("score")}
          >
            <View className="meal-detail-page__score-footer-copy">
              <Text className="meal-detail-page__score-footer-eyebrow">本餐评分</Text>
              <Text className="meal-detail-page__score-footer-summary">{scoreDetail.summary}</Text>
            </View>
            <View className="meal-detail-page__score-footer-action">
              <Text>依据</Text>
              <NordicIcon name="chevron-right" size={16} ariaLabel="查看本餐评分依据" />
            </View>
          </View>
        </AppCard>
        <AppCard className="meal-detail-page__composition">
          <Text className="meal-detail-page__section-title">营养构成</Text>
          {macros.map((macro) => (
            <MacroProgress
              key={macro.label}
              label={macro.label}
              value={macro.value}
              target={macro.target}
              tone={macro.tone}
            />
          ))}
        </AppCard>
        <View
          className="meal-detail-page__insight-card"
          ariaLabel="查看营养小结建议依据"
          onClick={() => setDetailModal("insight")}
        >
          <View className="meal-detail-page__insight-head">
            <View className="meal-detail-page__insight-orb">
              <NordicIcon name="nova" size={18} ariaLabel="营养小结" />
            </View>
            <View className="meal-detail-page__insight-title">
              <Text>营养小结</Text>
              <Text>这餐对今日目标的影响</Text>
            </View>
            <NordicIcon name="chevron-right" size={18} ariaLabel="查看营养小结建议依据" />
          </View>
          <Text className="meal-detail-page__insight-content">{meal.insight}</Text>
          <View className="meal-detail-page__insight-action">
            <Text>查看建议依据</Text>
          </View>
        </View>
      </View>
      <View className="meal-detail-page__actions">
        <View className="meal-detail-page__action" ariaLabel="编辑本餐" onClick={edit}>
          <NordicIcon name="pencil" size={22} ariaLabel="编辑" />
          <Text>编辑</Text>
        </View>
        <View
          className={`meal-detail-page__action ${meal.favorite ? "meal-detail-page__action--favorite" : ""}`}
          ariaLabel={meal.favorite ? "取消收藏本餐" : "收藏本餐"}
          onClick={() => void toggleFavorite()}
        >
          <NordicIcon
            name={meal.favorite ? "heart-filled" : "heart"}
            size={22}
            ariaLabel={meal.favorite ? "取消收藏" : "收藏"}
          />
          <Text>{meal.favorite ? "已收藏" : "收藏"}</Text>
        </View>
        <View
          className="meal-detail-page__action meal-detail-page__action--delete"
          ariaLabel="删除本餐"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <NordicIcon name="trash-2" size={22} ariaLabel="删除" />
          <Text>删除</Text>
        </View>
      </View>
      <Modal open={detailModal !== null}>
        <View className="meal-detail-page__detail-modal">
          <View className="meal-detail-page__detail-modal-head">
            <Text className="meal-detail-page__detail-modal-title">
              {detailModal === "score" ? "评分依据" : "营养小结"}
            </Text>
          </View>
          {detailModal === "score" ? (
            <View className="meal-detail-page__detail-modal-body">
              <Text className="meal-detail-page__detail-modal-lead">为什么是这个评分？</Text>
              {scoreDetail.reasons.map((reason) => (
                <View className="meal-detail-page__score-card-reason" key={reason}>
                  <NordicIcon name="check" size={14} ariaLabel="评分依据" />
                  <Text>{reason}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="meal-detail-page__detail-modal-body">
              <Text className="meal-detail-page__detail-modal-lead">{meal.insight}</Text>
              <View className="meal-detail-page__modal-metrics">
                <View>
                  <Text>本餐蛋白质</Text>
                  <Text>{nutrition.protein}g</Text>
                </View>
                <View>
                  <Text>本餐碳水</Text>
                  <Text>{nutrition.carbs}g</Text>
                </View>
              </View>
              <Text className="meal-detail-page__detail-modal-note">
                建议会随你当天已记录的餐食动态更新。
              </Text>
            </View>
          )}
          <AppButton size="large" onClick={() => setDetailModal(null)}>
            知道了
          </AppButton>
        </View>
      </Modal>
      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除这餐？"
        description="删除后，本地营养汇总会立即更新。"
        confirmLabel="删除"
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void remove()}
      />
    </PageLayout>
  );
}
