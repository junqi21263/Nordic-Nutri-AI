import { Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import { NordicIcon } from "../../components/nordic-icon";
import { createCoachAdvice } from "../../features/coach/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useCoachStore } from "../../stores/coach-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";

type ChatMessage = {
  id: string;
  role: "coach" | "user";
  content: string;
};

const quickPrompts = ["晚餐怎么补蛋白？", "查看今日进度"];
const nowTime = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const replyFor = (prompt: string, proteinLeft: number) => {
  if (prompt.includes("进度")) {
    return `截至现在，你距离今日蛋白质目标还差 ${proteinLeft}g。晚餐补一份优质蛋白，就能把今天的节奏稳住。`;
  }
  if (prompt.includes("蛋白质") || prompt.includes("蛋白")) {
    return `可以优先选择希腊酸奶、鸡胸肉或豆腐。加一份约 20–30g 蛋白质的小餐，会比临睡前吃得太多更轻松。`;
  }
  return "晚餐建议以一掌心大小的蛋白质、半盘蔬菜和一拳头主食为主。想要我按你家里的食材再细化吗？";
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "proactive-message",
      role: "coach",
      content:
        advice[0]?.message ||
        `早上好，Lewis。今天还差 ${proteinLeft}g 蛋白质，晚餐加一份优质蛋白就能更接近目标。`,
    },
  ]);

  const sendMessage = (value = draft) => {
    const content = value.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content },
      { id: `coach-${Date.now()}`, role: "coach", content: replyFor(content, proteinLeft) },
    ]);
    setDraft("");
  };

  const addSuggestedSnack = () => {
    const alreadyAdded = meals
      .getMealsByDate(date)
      .some((meal) => meal.title === "希腊酸奶" && meal.mealType === "snack");
    if (alreadyAdded) {
      feedback.show({ message: "今晚加餐里已经有希腊酸奶", tone: "success" });
      return;
    }
    meals.addMeal({
      date,
      time: nowTime(),
      title: "希腊酸奶",
      mealType: "snack",
      favorite: false,
      imageKey: null,
      insight: "教练建议的高蛋白加餐。",
      items: [
        {
          id: `coach-yogurt-${Date.now()}`,
          name: "希腊酸奶",
          amount: "1 杯",
          calories: 130,
          protein: 20,
          carbs: 8,
          fat: 3,
        },
      ],
    });
    feedback.show({ message: "已加入今晚加餐", tone: "success" });
    sendMessage("已将希腊酸奶加入今晚加餐");
  };

  return (
    <PageLayout
      activeTab="coach"
      hideNavigation
      title="你的营养教练"
      className="page-layout--coach-chat"
    >
      <View className="coach-chat">
        <View className="coach-chat__page-title">
          <Text>你的营养教练</Text>
        </View>

        <View className="coach-chat__status">
          <NordicIcon name="sparkles" size={17} ariaLabel="今日营养状态" />
          <Text>增肌目标 · 今日还差 {proteinLeft}g 蛋白质</Text>
        </View>

        <View className="coach-chat__conversation">
          {messages.map((message) => (
            <View
              key={message.id}
              className={`coach-chat__message coach-chat__message--${message.role}`}
            >
              {message.role === "coach" ? (
                <NordicIcon name="bot" size={20} ariaLabel="你的营养教练" />
              ) : null}
              <Text>{message.content}</Text>
            </View>
          ))}
        </View>

        <View className="coach-chat__suggestion">
          <View className="coach-chat__suggestion-label">
            <NordicIcon name="sparkles" size={18} ariaLabel="AI 建议" />
            <Text>AI 建议</Text>
          </View>
          <Text className="coach-chat__suggestion-title">加一份希腊酸奶</Text>
          <Text className="coach-chat__suggestion-copy">
            睡前补充约 20g 蛋白质，轻松缩小今日差距。
          </Text>
          <View className="coach-chat__suggestion-product" onClick={addSuggestedSnack}>
            <View className="coach-chat__suggestion-product-copy">
              <View className="coach-chat__suggestion-product-icon">
                <NordicIcon name="protein" size={20} ariaLabel="蛋白质加餐" />
              </View>
              <View>
                <Text className="coach-chat__suggestion-product-name">希腊酸奶</Text>
                <Text className="coach-chat__suggestion-product-meta">约 20g 蛋白质</Text>
              </View>
            </View>
            <NordicIcon name="circle-plus" size={24} ariaLabel="加入今晚加餐" />
          </View>
        </View>

        <View className="coach-chat__quick-actions">
          {quickPrompts.map((prompt) => (
            <View
              key={prompt}
              className="coach-chat__quick-chip"
              onClick={() => sendMessage(prompt)}
            >
              <Text>{prompt}</Text>
            </View>
          ))}
        </View>

        <View className="coach-chat__score">
          <NordicIcon name="sparkles" size={19} ariaLabel="今日营养评分" />
          <Text>今日营养评分</Text>
          <Text className="coach-chat__score-value">87</Text>
          <Text>/100</Text>
        </View>
        <Text className="coach-chat__safety-note">营养建议仅供日常饮食参考，不替代医疗意见。</Text>
      </View>

      <View className="coach-chat__composer">
        <Input
          className="coach-chat__input"
          value={draft}
          placeholder="问问你的营养教练，比如：晚餐吃什么？"
          confirmType="send"
          onInput={(event) => setDraft(event.detail.value)}
          onConfirm={() => sendMessage()}
        />
        <View className="coach-chat__send" ariaLabel="发送消息" onClick={() => sendMessage()}>
          <NordicIcon name="arrow-up" size={22} ariaLabel="发送" />
        </View>
      </View>
    </PageLayout>
  );
}
