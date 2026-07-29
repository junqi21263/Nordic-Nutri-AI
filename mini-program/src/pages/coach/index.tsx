import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  getProductCoachMessages,
  getProductCoachBrief,
  getProductCoachDailyTip,
  restartProductCoachConversation,
  sendProductCoachMessage,
  streamProductCoachMessage,
  type ProductCoachDailyTip,
  type ProductCoachMessage,
} from "../../api/coach-api";
import { createProductMeal } from "../../api/meal-data-api";
import { analyzeProductImage } from "../../api/vision-api";
import { CoachAvatar } from "../../components/coach-avatar";
import { NordicIcon } from "../../components/nordic-icon";
import { CoachComposer } from "./components/CoachComposer";
import { createCoachAdvice } from "../../features/coach/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { createClientRequestId } from "../../repositories/client-request-id";
import { useCoachStore } from "../../stores/coach-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";

type ChatMessage = {
  id: string;
  role: "coach" | "user";
  content: string;
  streaming?: boolean;
  imagePath?: string;
  imageLabel?: string;
};

const defaultQuickPrompts = ["晚餐怎么补蛋白？", "如何补充蛋白质？", "加餐推荐", "外食怎么选？"];
const defaultDailyTip: ProductCoachDailyTip = {
  type: "nutrition_tip",
  headline: "下一餐加一份深色蔬菜",
  content: "西兰花、菠菜等能帮助补充膳食纤维；搭配蛋白质和适量主食更均衡。",
  food: null,
  source: "rule_v2",
  model: null,
};
const nowTime = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export default function CoachPage() {
  const meals = useMealStore();
  const coach = useCoachStore();
  const feedback = useFeedbackStore();
  const date = getLocalDateString();
  const summary = meals.getDailySummary(date);
  const advice = coach.advice.length ? coach.advice : createCoachAdvice(meals.meals, date);
  const proteinLeft = Math.max(0, summary.protein - summary.consumed.protein);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState(defaultQuickPrompts);
  const [dailyTip, setDailyTip] = useState<ProductCoachDailyTip | null>(null);
  const [dailyTipLoading, setDailyTipLoading] = useState(false);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    suggestion: true,
    progress: true,
    quickReplies: true,
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "proactive-message",
      role: "coach",
      content:
        advice[0]?.message ||
        `早上好，Lewis。今天还差 ${proteinLeft}g 蛋白质，晚餐加一份优质蛋白就能更接近目标。`,
    },
  ]);

  const mergeServerMessages = (
    result: { messages: ProductCoachMessage[] },
    temporaryIds: string[],
    attachment?: Pick<ChatMessage, "imagePath" | "imageLabel">,
  ) => {
    setMessages((current) => {
      const retained = current.filter((message) => !temporaryIds.includes(message.id));
      const known = new Set(retained.map((message) => message.id));
      return [
        ...retained,
        ...result.messages
          .filter((message) => !known.has(message.id))
          .map((message, index) => ({
            id: message.id,
            role: message.role === "assistant" ? ("coach" as const) : ("user" as const),
            content: message.content,
            ...(attachment && index === 0 ? attachment : {}),
          })),
      ];
    });
  };

  const refreshCoachBrief = async () => {
    try {
      const brief = await getProductCoachBrief(date);
      if (brief.quickPrompts.length) setQuickPrompts(brief.quickPrompts);
    } catch {
      // A previous server brief or the local defaults remain usable offline.
    }
  };

  const loadDailyTip = async () => {
    if (dailyTipLoading) return;
    setDailyTipLoading(true);
    try {
      setDailyTip(await getProductCoachDailyTip(date));
    } catch {
      setDailyTip((current) => current ?? defaultDailyTip);
    } finally {
      setDailyTipLoading(false);
    }
  };

  const createProactiveMessage = (): ChatMessage => ({
    id: "proactive-message-" + Date.now(),
    role: "coach",
    content:
      advice[0]?.message ||
      `早上好，Lewis。今天还差 ${proteinLeft}g 蛋白质，晚餐加一份优质蛋白就能更接近目标。`,
  });

  const handleRestartConversation = async () => {
    if (sending || restarting) return;
    const modal = await Taro.showModal({
      title: "重启对话",
      content: "当前对话会清空，历史记录仍会保留。确定重新开始吗？",
      confirmText: "确定重启",
      cancelText: "取消",
    });
    if (!modal.confirm) return;
    setRestarting(true);
    try {
      await restartProductCoachConversation();
      setMessages([createProactiveMessage()]);
      setDraft("");
      setSelectedImagePath(null);
      await Promise.all([refreshCoachBrief(), loadDailyTip()]);
      feedback.show({ message: "已开启新的营养教练对话", tone: "success" });
    } catch {
      feedback.show({ message: "重启对话失败，请稍后重试", tone: "error" });
    } finally {
      setRestarting(false);
    }
  };

  useEffect(() => {
    void getProductCoachMessages()
      .then((history) => {
        if (!history.length) return;
        setMessages(
          history.map((message) => ({
            id: message.id,
            role: message.role === "assistant" ? "coach" : "user",
            content: message.content,
          })),
        );
      })
      .catch(() => undefined);
     void refreshCoachBrief();
     void loadDailyTip();
   }, []);

  const sendMessage = async (value = draft, imagePath = selectedImagePath) => {
    const userPrompt = value.trim();
    if ((!userPrompt && !imagePath) || sending) return;
    let content = userPrompt;
    let attachment: Pick<ChatMessage, "imagePath" | "imageLabel"> | undefined;
    if (imagePath) {
      try {
        const imageMeal = await analyzeProductImage(imagePath);
        content = `${userPrompt || "请分析这张食物图片。"}\n图片识别结果：${imageMeal.title}；${imageMeal.insight}`;
        attachment = { imagePath, imageLabel: `已上传：${imageMeal.title}` };
      } catch (error) {
        feedback.show({
          message:
            error instanceof Error && error.name === "VISION_SERVICE_NOT_CONFIGURED"
              ? "图片识别服务尚未配置，请先发送文字问题"
              : "图片上传或识别失败，请重试",
          tone: "error",
        });
        return;
      }
    }
    const requestId = createClientRequestId();
    const optimisticId = "pending-" + requestId;
    const streamingId = "stream-" + requestId;
    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        role: "user",
        content: userPrompt || "请分析这张食物图片。",
        ...attachment,
      },
    ]);
    setDraft("");
    setSelectedImagePath(null);
    setSending(true);
    try {
      setMessages((current) => [
        ...current,
        { id: streamingId, role: "coach", content: "", streaming: true },
      ]);
      let completed = false;
      await streamProductCoachMessage(
        content,
        date,
        (event) => {
          if (event.type === "delta") {
            setMessages((current) =>
              current.map((message) =>
                message.id === streamingId
                  ? { ...message, content: message.content + event.text }
                  : message,
              ),
            );
            return;
          }
          if (event.type === "complete") {
            completed = true;
            mergeServerMessages(event, [optimisticId, streamingId], attachment);
          }
        },
        requestId,
      );
      if (!completed) throw new Error("流式回复未完成");
    } catch {
      try {
        const result = await sendProductCoachMessage(content, date, requestId);
        mergeServerMessages(result, [optimisticId, streamingId], attachment);
      } catch {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticId && message.id !== streamingId),
        );
        feedback.show({ message: "营养教练暂时无法回答，请稍后重试", tone: "error" });
      }
    } finally {
      setSending(false);
      void refreshCoachBrief();
    }
  };

  const chooseCoachImage = async () => {
    if (sending) return;
    try {
      const result = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["original", "compressed"],
      });
      const path = result.tempFiles[0]?.tempFilePath;
      if (!path) throw new Error("没有获取到图片");
      setSelectedImagePath(path);
    } catch (error) {
      if (!String(error).includes("cancel")) {
        feedback.show({ message: "无法选择图片，请检查相册或相机权限", tone: "error" });
      }
    }
  };

  const addSuggestedSnack = async () => {
    const alreadyAdded = meals
      .getMealsByDate(date)
      .some((meal) => meal.title === "希腊酸奶" && meal.mealType === "snack");
    if (alreadyAdded) {
      feedback.show({ message: "今晚加餐里已经有希腊酸奶", tone: "success" });
      return;
    }
    const time = nowTime();
    try {
      const saved = await createProductMeal({
        mealType: "snack",
        name: "希腊酸奶",
        recordedAt: `${date}T${time}:00+08:00`,
        items: [
          {
            name: "希腊酸奶",
            quantityG: 200,
            caloriesPer100g: 65,
            proteinPer100g: 10,
            carbsPer100g: 4,
            fatPer100g: 1.5,
          },
        ],
      });
      meals.addMeal(saved);
      feedback.show({ message: "已加入今晚加餐", tone: "success" });
      await sendMessage("已将希腊酸奶加入今晚加餐");
      await refreshCoachBrief();
    } catch {
      feedback.show({ message: "加餐保存失败，请稍后重试", tone: "error" });
    }
  };

  return (
    <PageLayout
      activeTab="coach"
      hideNavigation
      title="你的营养教练"
      topBarAction="重启对话"
      onTopBarAction={() => void handleRestartConversation()}
      className="page-layout--coach-chat"
    >
      <View className="coach-chat">
        <View className="coach-chat__hero">
          <View className="coach-chat__hero-copy">
            <View className="coach-chat__status-badge">
              <NordicIcon name="sparkles" size={15} ariaLabel="今日营养状态" />
              <Text>增肌目标 · 今日还差 {proteinLeft}g 蛋白质</Text>
            </View>
            <Text className="coach-chat__hero-kicker">NOVA · 今日营养陪伴</Text>
            <Text className="coach-chat__hero-title">晚上好，{"\n"}我来帮你补齐今天的蛋白质</Text>
            <View className="coach-chat__hero-actions">
              <View
                className="coach-chat__hero-action"
                onClick={() => void sendMessage("晚餐怎么补蛋白？")}
              >
                <NordicIcon name="protein" size={18} ariaLabel="晚餐补蛋白" />
                <Text>晚餐怎么补蛋白？</Text>
              </View>
              <View
                className="coach-chat__hero-action"
                onClick={() => void sendMessage("查看今日进度")}
              >
                <NordicIcon name="list-checks" size={18} ariaLabel="查看今日进度" />
                <Text>查看今日进度</Text>
              </View>
            </View>
          </View>
        </View>

        <View className="coach-chat__conversation">
          {messages.map((message) => (
            <View
              key={message.id}
              className={`coach-chat__message coach-chat__message--${message.role}`}
            >
              {message.role === "coach" ? (
                <CoachAvatar status={message.streaming ? "thinking" : "idle"} />
              ) : null}
              <View className="coach-chat__message-body">
                {message.imagePath ? (
                  <Image
                    className="coach-chat__message-image"
                    src={message.imagePath}
                    mode="aspectFill"
                  />
                ) : null}
                {message.imageLabel ? (
                  <Text className="coach-chat__message-image-label">{message.imageLabel}</Text>
                ) : null}
                <Text
                  className={
                    message.streaming ? "coach-chat__streaming-copy" : "coach-chat__message-copy"
                  }
                >
                  {message.content || "NOVA 正在整理建议…"}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View className="coach-chat__suggestion">
          <View
            className={`coach-chat__section-toggle ${
              expandedSections.suggestion
                ? "coach-chat__section-toggle--expanded"
                : "coach-chat__section-toggle--collapsed"
            }`}
            ariaLabel={expandedSections.suggestion ? "收起今日营养建议" : "展开今日营养建议"}
            onClick={() =>
              setExpandedSections((current) => ({ ...current, suggestion: !current.suggestion }))
            }
          >
            <View className="coach-chat__suggestion-label">
              <NordicIcon name="sparkles" size={18} ariaLabel="今日营养建议" />
              <Text>今日营养建议</Text>
            </View>
            <View className="coach-chat__suggestion-actions">
              <View
                className={`coach-chat__suggestion-refresh ${dailyTipLoading ? "coach-chat__suggestion-refresh--loading" : ""}`}
                ariaLabel="换一条今日营养建议"
                onClick={(event) => {
                  event.stopPropagation();
                  void loadDailyTip();
                }}
              >
                <NordicIcon name="refresh-cw" size={15} ariaLabel="换一条" />
                <Text>换一条</Text>
              </View>
              <View
                className="coach-chat__suggestion-collapse"
                ariaLabel={expandedSections.suggestion ? "收起" : "展开"}
              >
                <NordicIcon name="chevron-right" size={16} ariaLabel="展开或收起" />
              </View>
            </View>
          </View>
          {expandedSections.suggestion ? (
            <>
              <Text className="coach-chat__suggestion-title">
                {dailyTipLoading ? "正在整理今日建议…" : (dailyTip ?? defaultDailyTip).headline}
              </Text>
              <Text className="coach-chat__suggestion-copy">
                {dailyTipLoading ? "正在结合你的今日记录准备一条小建议。" : (dailyTip ?? defaultDailyTip).content}
              </Text>
              {(dailyTip ?? defaultDailyTip).food?.name === "希腊酸奶" ? (
                <View className="coach-chat__suggestion-product" onClick={addSuggestedSnack}>
                  <View className="coach-chat__suggestion-product-copy">
                    <View className="coach-chat__suggestion-product-icon">
                      <NordicIcon name="protein" size={20} ariaLabel="蛋白质加餐" />
                    </View>
                    <View>
                      <Text className="coach-chat__suggestion-product-name">希腊酸奶</Text>
                      <Text className="coach-chat__suggestion-product-meta">
                        约 {(dailyTip ?? defaultDailyTip).food?.proteinG ?? 20}g 蛋白质
                      </Text>
                    </View>
                  </View>
                  <NordicIcon name="circle-plus" size={24} ariaLabel="加入今晚加餐" />
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <View className="coach-chat__bottom-tools">
          <View className="coach-chat__progress-card">
            <View
              className={`coach-chat__progress-heading coach-chat__section-toggle ${
                expandedSections.progress
                  ? "coach-chat__section-toggle--expanded"
                  : "coach-chat__section-toggle--collapsed"
              }`}
              ariaLabel={expandedSections.progress ? "收起今日进度" : "展开今日进度"}
              onClick={() =>
                setExpandedSections((current) => ({ ...current, progress: !current.progress }))
              }
            >
              <View>
                <Text className="coach-chat__progress-kicker">今日进度</Text>
                <Text className="coach-chat__progress-title">营养节奏</Text>
              </View>
              <View className="coach-chat__progress-score-group">
                <Text className="coach-chat__progress-score">{summary.completion}</Text>
                <Text className="coach-chat__progress-unit">/100</Text>
                <NordicIcon
                  name="chevron-right"
                  size={16}
                  ariaLabel={expandedSections.progress ? "收起" : "展开"}
                />
              </View>
            </View>
            {expandedSections.progress
              ? [
                  ["蛋白质", summary.consumed.protein, summary.protein],
                  ["碳水", summary.consumed.carbs, summary.carbs],
                  ["热量", summary.consumed.calories, summary.calories],
                ].map(([label, consumed, target]) => {
                  const numericConsumed = Number(consumed);
                  const numericTarget = Number(target);
                  const progress = Math.min(
                    100,
                    Math.round((numericConsumed / Math.max(1, numericTarget)) * 100),
                  );
                  return (
                    <View className="coach-chat__progress-row" key={String(label)}>
                      <View className="coach-chat__progress-row-copy">
                        <Text>{label}</Text>
                        <Text>
                          {numericConsumed}/{numericTarget}
                          {label === "热量" ? " kcal" : "g"}
                        </Text>
                      </View>
                      <View className="coach-chat__progress-track">
                        <View
                          className="coach-chat__progress-fill"
                          style={{ width: String(progress) + "%" }}
                        />
                      </View>
                    </View>
                  );
                })
              : null}
          </View>

          <View className="coach-chat__quick-section">
            <View
              className={`coach-chat__section-toggle ${
                expandedSections.quickReplies
                  ? "coach-chat__section-toggle--expanded"
                  : "coach-chat__section-toggle--collapsed"
              }`}
              ariaLabel={expandedSections.quickReplies ? "收起快捷提问" : "展开快捷提问"}
              onClick={() =>
                setExpandedSections((current) => ({
                  ...current,
                  quickReplies: !current.quickReplies,
                }))
              }
            >
              <Text className="coach-chat__quick-title">快捷提问</Text>
              <NordicIcon
                name="chevron-right"
                size={16}
                ariaLabel={expandedSections.quickReplies ? "收起" : "展开"}
              />
            </View>
            {expandedSections.quickReplies ? (
              <View className="coach-chat__quick-actions">
                {quickPrompts.map((prompt) => (
                  <View
                    key={prompt}
                    className="coach-chat__quick-chip"
                    onClick={() => void sendMessage(prompt)}
                  >
                    <Text>{prompt}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <Text className="coach-chat__safety-note">
            营养建议仅供日常饮食参考，不替代医疗意见。
          </Text>
        </View>
      </View>

      <CoachComposer
        value={draft}
        disabled={sending}
        selectedImagePath={selectedImagePath}
        onInput={setDraft}
        onSend={() => void sendMessage()}
        onPickImage={() => void chooseCoachImage()}
        onClearImage={() => setSelectedImagePath(null)}
      />
    </PageLayout>
  );
}
