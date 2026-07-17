import { Image, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { ErrorState } from "../../components/error-state";
import { MacroProgress } from "../../components/macro-progress";
import { NordicIcon } from "../../components/nordic-icon";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Modal } from "../../components/modal";
import { getPublicRuntimeConfig } from "../../api/environment";
import { getMealNutrition, getMealScore } from "../../features/meals/domain";
import { PageLayout } from "../../layouts/page-layout";
import { toMealMutationInput } from "../../repositories/meal-repository";
import { selectRuntimeAdapter } from "../../repositories/runtime-adapter";
import { useMealStore } from "../../stores/meal-store";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";
import mealBowlImage from "../../assets/meal-bowl.svg";
import mealOatsImage from "../../assets/meal-oats.svg";
import mealSalmonImage from "../../assets/meal-salmon.svg";

const mealImages = {
  bowl: mealBowlImage,
  oats: mealOatsImage,
  salmon: mealSalmonImage,
};

const ingredientImages = [mealOatsImage, mealBowlImage, mealSalmonImage];

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
  const usesRealBackend = selectRuntimeAdapter(getPublicRuntimeConfig()) === "supabase";
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<"score" | "insight" | null>(null);
  const meal = store.getMealById(router.params.id);
  if (!meal)
    return (
      <PageLayout
        title="餐次详情"
        subtitle="找不到这条本地记录。"
        eyebrow="饮食记录"
        showTabs={false}
        leading="‹"
        onLeadingClick={() => navigateBackOrHome("/pages/meal-records/index")}
      >
        <ErrorState title="餐次不存在" description="它可能已被删除，或链接已经失效。" />
        <AppButton size="large" onClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}>
          返回饮食记录
        </AppButton>
      </PageLayout>
    );
  const nutrition = getMealNutrition(meal);
  const score = getMealScore(meal);
  const scoreDetail = scoreCopy[score];
  const macros = [
    { icon: "protein" as const, label: "蛋白质", target: 60, tone: undefined, value: nutrition.protein },
    { icon: "carbs" as const, label: "碳水", target: 90, tone: "carbs" as const, value: nutrition.carbs },
    { icon: "fat" as const, label: "脂肪", target: 25, tone: "fat" as const, value: nutrition.fat },
  ];
  const heroImage = meal.imageKey ? mealImages[meal.imageKey] : mealBowlImage;
  const edit = () => {
    store.setEditingMealId(meal.id);
    portion.startMealEdit(meal);
    Taro.navigateTo({ url: `/pages/portion-adjustment/index?id=${meal.id}` });
  };
  const remove = async () => {
    try {
      if (usesRealBackend) {
        await store.archiveRemote(meal.id);
      } else {
        store.deleteMeal(meal.id);
      }
      feedback.show({ message: usesRealBackend ? "餐次已移至回收站" : "餐次已从本地记录移除", tone: "success" });
      Taro.switchTab({ url: "/pages/meal-records/index" });
    } catch {
      feedback.show({ message: "删除失败，请稍后重试", tone: "error" });
    }
  };
  const toggleFavorite = async () => {
    try {
      if (usesRealBackend) {
        await store.updateRemote(meal.id, toMealMutationInput(meal, { favorite: !meal.favorite }));
      } else {
        store.toggleFavorite(meal.id);
      }
      feedback.show({ message: meal.favorite ? "已取消收藏" : "已加入收藏", tone: "success" });
    } catch {
      feedback.show({ message: "收藏状态更新失败，请稍后重试", tone: "error" });
    }
  };
  const openIngredient = (itemId: string) => {
    Taro.navigateTo({ url: `/pages/ingredient-detail/index?mealId=${meal.id}&itemId=${itemId}` });
  };
  return (
    <PageLayout
      title="餐食详情"
      showTabs={false}
      hideNavigation
      className="page-layout--meal-detail"
    >
      <View className="meal-detail-page">
        <View className="meal-detail-page__page-title">
          <View
            className="meal-detail-page__back"
            ariaLabel="返回饮食记录"
            onClick={() => navigateBackOrHome("/pages/meal-records/index")}
          >
            <NordicIcon name="back" size={24} ariaLabel="返回饮食记录" />
          </View>
          <Text>餐食详情</Text>
        </View>
        <View className="meal-detail-page__heading">
          <Text className="meal-detail-page__meal-title">{meal.title}</Text>
          <Text className="meal-detail-page__meta">{meal.date} · {meal.time}</Text>
        </View>
        <AppCard tone="beige" className="meal-detail-page__hero">
          <View
            className="meal-detail-page__hero-visual"
            ariaLabel="查看原始餐食照片"
            onClick={() => Taro.previewImage({ current: heroImage, urls: [heroImage] })}
          >
            <Image className="meal-detail-page__hero-image" mode="aspectFill" src={heroImage} />
            <View className="meal-detail-page__image-preview-hint">
              <Text>查看原图</Text>
            </View>
          </View>
          <View className="meal-detail-page__hero-copy">
            <View
              className="meal-detail-page__score-card"
              ariaLabel="查看本餐评分依据"
              onClick={() => setDetailModal("score")}
            >
              <View className="meal-detail-page__score-card-head">
                <View>
                  <Text className="meal-detail-page__score-card-eyebrow">本餐评分</Text>
                  <Text className="meal-detail-page__score-card-label">{scoreDetail.label}</Text>
                </View>
                <View className="meal-detail-page__score-grade">
                  <Text>{score}</Text>
                  <Text>级</Text>
                </View>
              </View>
              <Text className="meal-detail-page__score-card-summary">{scoreDetail.summary}</Text>
              <View className="meal-detail-page__score-card-action">
                <Text>查看评分依据</Text>
                <NordicIcon name="chevron-right" size={16} ariaLabel="查看本餐评分依据" />
              </View>
            </View>
            <Text className="meal-detail-page__calories">
              {nutrition.calories}<Text> kcal</Text>
            </Text>
            <View className="meal-detail-page__hero-macros">
              <View className="meal-detail-page__hero-macro">
                <View className="meal-detail-page__hero-macro-icon"><NordicIcon name="protein" size={18} ariaLabel="蛋白质" /></View>
                <Text>蛋白质</Text><Text>{nutrition.protein}g</Text>
              </View>
              <View className="meal-detail-page__hero-macro">
                <View className="meal-detail-page__hero-macro-icon"><NordicIcon name="carbs" size={18} ariaLabel="碳水" /></View>
                <Text>碳水</Text><Text>{nutrition.carbs}g</Text>
              </View>
              <View className="meal-detail-page__hero-macro">
                <View className="meal-detail-page__hero-macro-icon"><NordicIcon name="fat" size={18} ariaLabel="脂肪" /></View>
                <Text>脂肪</Text><Text>{nutrition.fat}g</Text>
              </View>
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
              <NordicIcon name="sparkles" size={18} ariaLabel="NOVA AI" />
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
        <AppCard className="meal-detail-page__ingredients">
          <Text className="meal-detail-page__section-title">这餐包含</Text>
          {meal.items.map((item, index) => (
            <View
              className="meal-detail-page__ingredient-row"
              key={item.id}
              ariaLabel={`查看${item.name}详情`}
              onClick={() => openIngredient(item.id)}
            >
              <Image
                className="meal-detail-page__ingredient-thumb"
                mode="aspectFill"
                src={ingredientImages[index % ingredientImages.length]}
              />
              <View className="meal-detail-page__ingredient-copy">
                <Text>{item.name}</Text>
                <Text>{item.amount}</Text>
              </View>
              <View className="meal-detail-page__ingredient-meta">
                <Text>{item.calories} kcal</Text>
                <NordicIcon name="chevron-right" size={18} ariaLabel={`${item.name}详情`} />
              </View>
            </View>
          ))}
        </AppCard>
      </View>
      <View className="meal-detail-page__actions">
        <View className="meal-detail-page__action" ariaLabel="编辑本餐" onClick={edit}>
          <NordicIcon name="pencil" size={22} ariaLabel="编辑" />
          <Text>编辑</Text>
        </View>
        <View className="meal-detail-page__action" ariaLabel={meal.favorite ? "取消收藏本餐" : "收藏本餐"} onClick={() => void toggleFavorite()}>
          <NordicIcon name="heart" size={22} ariaLabel={meal.favorite ? "取消收藏" : "收藏"} />
          <Text>{meal.favorite ? "已收藏" : "收藏"}</Text>
        </View>
        <View className="meal-detail-page__action meal-detail-page__action--delete" ariaLabel="删除本餐" onClick={() => setDeleteDialogOpen(true)}>
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
