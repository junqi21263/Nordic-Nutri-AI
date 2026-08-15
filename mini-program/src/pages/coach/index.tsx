import { Image, MovableArea, MovableView, Text, View } from "@tarojs/components";
import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import {
  getProductCoachMessages,
  getProductCoachBrief,
  getProductCoachDailyTip,
  restartProductCoachConversation,
  sendProductCoachMessage,
  streamProductCoachMessage,
  type ProductCoachDailyTip,
  type ProductCoachDailyUsage,
  type ProductCoachMessage,
} from "../../api/coach-api";
import { getProductDailySummary } from "../../api/insight-api";
import { analyzeProductImage } from "../../api/vision-api";
import { AnimatedProgressBar } from "../../components/animated-progress-bar";
import { CoachAvatar } from "../../components/coach-avatar";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { NordicIcon } from "../../components/nordic-icon";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { CoachComposer } from "./components/CoachComposer";
import {
  completeAnalysisForAnswer,
  completeAnalysisForFallback,
  createAnalysisProgress,
  type AnalysisProgressState,
  type AssistantGenerationStatus,
} from "../../features/coach/analysis-progress";
import { createCoachAdvice } from "../../features/coach/domain";
import { createCoachMealContext } from "../../features/coach/meal-context";
import { getCoachGreeting } from "../../features/coach/server-time";
import { clampProgress, formatTargetStatus } from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { feedbackVariantForError } from "../../features/feedback/feedback-error";
import { useAppShare } from "../../hooks/use-app-share";
import { PageLayout } from "../../layouts/page-layout";
import { createClientRequestId } from "../../repositories/client-request-id";
import { useCoachStore } from "../../stores/coach-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
import { useProfileStore } from "../../stores/profile-store";

type ChatMessage = {
  id: string;
  role: "coach" | "user";
  content: string;
  streaming?: boolean;
  generationStatus?: AssistantGenerationStatus;
  analysis?: AnalysisProgressState;
  imagePath?: string;
  imageLabel?: string;
};

const defaultHeroPrompt = "下一餐怎么补充蛋白质？";
const defaultQuickPrompts = ["我今天吃什么？", "我的蛋白够吗？", "下一餐怎么搭配？"];
const dailyLimitMessage = "因个人开发成本有限，当前每人每日限制聊20句";
const defaultDailyUsage: ProductCoachDailyUsage = { limit: 20, used: 0, remaining: 20 };
const scrollTopPositionStorageKey = "nordic.coach.scrollTopPosition";
const scrollTopControlSize = 36;
const scrollTopControlEdgeInset = 12;
const defaultDailyTip: ProductCoachDailyTip = {
  type: "nutrition_tip",
  headline: "下一餐加一份深色蔬菜",
  content: "西兰花、菠菜等能帮助补充膳食纤维；搭配蛋白质和适量主食更均衡。",
  reason: "帮助补足当天的膳食纤维。",
  food: null,
  source: "rule_v2",
  model: null,
};
type ScrollTopPosition = { x: number; y: number };

function getDefaultScrollTopPosition(): ScrollTopPosition {
  try {
    const { windowHeight, windowWidth } = Taro.getWindowInfo();
    return {
      x: Math.max(0, windowWidth - scrollTopControlSize - scrollTopControlEdgeInset),
      y: Math.max(0, Math.round((windowHeight - scrollTopControlSize) * 0.32)),
    };
  } catch {
    return { x: 327, y: 250 };
  }
}

function getStoredScrollTopPosition(): ScrollTopPosition {
  const fallback = getDefaultScrollTopPosition();
  try {
    const stored = Taro.getStorageSync(scrollTopPositionStorageKey) as Partial<ScrollTopPosition> | null;
    if (typeof stored?.x === "number" && typeof stored?.y === "number") {
      return { x: Math.max(0, stored.x), y: Math.max(0, stored.y) };
    }
  } catch {
    // The default position remains available when local storage is unavailable.
  }
  return fallback;
}

function getSnappedScrollTopPosition(position: ScrollTopPosition): ScrollTopPosition {
  try {
    const { windowWidth } = Taro.getWindowInfo();
    const snapLeft = position.x + scrollTopControlSize / 2 < windowWidth / 2;
    return {
      x: snapLeft
        ? scrollTopControlEdgeInset
        : Math.max(0, windowWidth - scrollTopControlSize - scrollTopControlEdgeInset),
      y: position.y,
    };
  } catch {
    return position;
  }
}

export default function CoachPage() {
  useAppShare();
  const meals = useMealStore();
  const profile = useProfileStore();
  const coach = useCoachStore();
  const feedback = useFeedbackStore();
  const date = getLocalDateString();
  const summary = meals.getDailySummary(date);
  const advice = coach.advice.length
    ? coach.advice
    : createCoachAdvice(meals.meals, date, meals.dailyTargets);
  const proteinLeft = Math.max(0, summary.protein - summary.consumed.protein);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState(defaultQuickPrompts);
  const [heroPrompt, setHeroPrompt] = useState(defaultHeroPrompt);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [dailyTip, setDailyTip] = useState<ProductCoachDailyTip | null>(null);
  const [dailyTipLoading, setDailyTipLoading] = useState(false);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState<ProductCoachDailyUsage>(defaultDailyUsage);
  const [completedReplyVersion, setCompletedReplyVersion] = useState(0);
  const [scrollTopPosition, setScrollTopPosition] = useState<ScrollTopPosition>(getStoredScrollTopPosition);
  const [scrollTopSnapAnimating, setScrollTopSnapAnimating] = useState(false);
  const scrollTopPositionRef = useRef(scrollTopPosition);
  const scrollTopDraggedRef = useRef(false);
  const activeStreamRef = useRef<{ id: string; abort: () => void } | null>(null);
  const pageActiveRef = useRef(true);
  const [expandedSections, setExpandedSections] = useState({
    suggestion: false,
    progress: false,
    quickReplies: true,
  });
  const greeting = getCoachGreeting(serverTime);
  const heroContext = createCoachMealContext({
    meals: meals.getMealsByDate(date),
    summary,
    hour: new Date().getHours(),
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "proactive-message",
      role: "coach",
      content:
        advice[0]?.message ||
        `你好，Lewis。今天还差 ${proteinLeft}g 蛋白质，晚餐加一份优质蛋白就能更接近目标。`,
    },
  ]);

  const mergeServerMessages = (
    result: { messages: ProductCoachMessage[]; dailyUsage: ProductCoachDailyUsage },
    temporaryIds: string[],
    attachment?: Pick<ChatMessage, "imagePath" | "imageLabel">,
    analysis?: AnalysisProgressState,
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
            ...(message.role === "assistant" && analysis
              ? { generationStatus: "completed" as const, analysis }
              : {}),
          })),
      ];
    });
    setDailyUsage(result.dailyUsage);
    setCompletedReplyVersion((version) => version + 1);
  };

  useEffect(() => {
    if (!completedReplyVersion) return undefined;
    const timer = setTimeout(() => {
      void Taro.pageScrollTo({ scrollTop: 999999, duration: 300 });
    }, 0);
    return () => clearTimeout(timer);
  }, [completedReplyVersion]);

  useEffect(() => {
    return () => {
      pageActiveRef.current = false;
      activeStreamRef.current?.abort();
      activeStreamRef.current = null;
    };
  }, []);

  const refreshCoachBrief = async () => {
    try {
      const brief = await getProductCoachBrief(date);
      if (brief.quickPrompts.length) setQuickPrompts(brief.quickPrompts);
      if (brief.heroPrompt) setHeroPrompt(brief.heroPrompt);
      setServerTime(brief.serverTime);
      setDailyUsage(brief.dailyUsage);
    } catch {
      // A previous server brief or the local defaults remain usable offline.
    }
  };

  const loadDailyTip = async (refresh = false) => {
    if (dailyTipLoading) return;
    setDailyTipLoading(true);
    try {
      setDailyTip(await getProductCoachDailyTip(date, { refresh }));
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
      `${greeting}，Lewis。今天还差 ${proteinLeft}g 蛋白质，晚餐加一份优质蛋白就能更接近目标。`,
  });

  const handleRestartConversation = async () => {
    if (sending || restarting) return;
    setRestartDialogOpen(false);
    setRestarting(true);
    try {
      await restartProductCoachConversation();
      setMessages([createProactiveMessage()]);
      setDraft("");
      setSelectedImagePath(null);
      await Promise.all([refreshCoachBrief(), loadDailyTip()]);
      feedback.show({ message: "已开启新的营养教练对话", tone: "success" });
    } catch {
      feedback.show({ message: "新对话开启失败，请稍后重试", tone: "error" });
    } finally {
      setRestarting(false);
    }
  };

  useDidShow(() => {
    // Tab pages stay mounted; re-fetch time-sensitive Coach data when the tab returns.
    void refreshCoachBrief();
    void loadDailyTip();
    // Keep nutrition rhythm targets in sync with home / cloud plan.
    void getProductDailySummary(date, { light: true })
      .then((dailySummary) => {
        meals.setDailyTargets(dailySummary.targets);
      })
      .catch(() => undefined);
  });

  useDidHide(() => {
    activeStreamRef.current?.abort();
    activeStreamRef.current = null;
  });

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
  }, []);

  const toggleAnalysis = (messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.analysis && message.generationStatus !== "analyzing"
          ? { ...message, analysis: { ...message.analysis, expanded: !message.analysis.expanded } }
          : message,
      ),
    );
  };

  const sendMessage = async (value = draft, imagePath = selectedImagePath) => {
    const userPrompt = value.trim();
    if ((!userPrompt && !imagePath) || sending) return;
    if (dailyUsage.remaining <= 0) {
      feedback.showModal({
        variant: "limit",
        title: "今日对话额度已用完",
        description: dailyLimitMessage,
        primaryText: "知道了",
        dismissible: true,
      });
      return;
    }
    let content = userPrompt;
    let attachment: Pick<ChatMessage, "imagePath" | "imageLabel"> | undefined;
    if (imagePath) {
      try {
        const imageMeal = await analyzeProductImage(imagePath);
        content = `${userPrompt || "请分析这张食物图片。"}\n图片识别结果：${imageMeal.title}；${imageMeal.insight}`;
        attachment = { imagePath, imageLabel: `已上传：${imageMeal.title}` };
      } catch (error) {
        const isNotConfigured = error instanceof Error && error.name === "VISION_SERVICE_NOT_CONFIGURED";
        feedback.showModal({
          variant: feedbackVariantForError(error),
          title: isNotConfigured ? "图片识别服务未配置" : "图片上传或识别失败",
          description: isNotConfigured ? "请先发送文字问题。" : "请稍后重试。",
          primaryText: "知道了",
          dismissible: true,
        });
        return;
      }
    }
    const requestId = createClientRequestId();
    const optimisticId = "pending-" + requestId;
    const streamingId = "stream-" + requestId;
    let analysis = createAnalysisProgress(userPrompt || "请分析这张食物图片。", Date.now());
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
        {
          id: streamingId,
          role: "coach",
          content: "",
          streaming: true,
          generationStatus: "analyzing",
          analysis,
        },
      ]);
      let completed = false;
      let receivedDelta = false;
      activeStreamRef.current = { id: requestId, abort: () => undefined };
      const streamRequest = streamProductCoachMessage(
        content,
        date,
        (event) => {
          if (!pageActiveRef.current) return;
          if (activeStreamRef.current?.id !== requestId) return;
          if (event.type === "delta") {
            if (!event.text) return;
            if (!receivedDelta) {
              receivedDelta = true;
              analysis = completeAnalysisForAnswer(analysis, Date.now());
            }
            setMessages((current) =>
              current.map((message) =>
                message.id === streamingId
                  ? {
                      ...message,
                      content: message.content + event.text,
                      generationStatus: "answering",
                      analysis,
                    }
                  : message,
              ),
            );
            return;
          }
          if (event.type === "complete") {
            completed = true;
            analysis = analysis.completedAt ? analysis : completeAnalysisForAnswer(analysis, Date.now());
            mergeServerMessages(event, [optimisticId, streamingId], attachment, analysis);
          }
        },
        requestId,
      );
      if (activeStreamRef.current?.id === requestId) {
        activeStreamRef.current = { id: requestId, abort: streamRequest.abort };
      }
      await streamRequest.promise;
      if (!completed) throw new Error("流式回复未完成");
    } catch (streamError) {
      if (streamError instanceof Error && streamError.name === "COACH_STREAM_ABORTED") return;
      if (streamError instanceof Error && streamError.name === "COACH_DAILY_LIMIT_REACHED") {
        setMessages((current) => current.filter((message) => message.id !== optimisticId && message.id !== streamingId));
        setDailyUsage((current) => ({ ...current, used: current.limit, remaining: 0 }));
        feedback.showModal({
          variant: "limit",
          title: "今日对话额度已用完",
          description: dailyLimitMessage,
          primaryText: "知道了",
          dismissible: true,
        });
        return;
      }
      try {
        const result = await sendProductCoachMessage(content, date, requestId);
        if (!pageActiveRef.current) return;
        analysis = completeAnalysisForFallback(analysis, Date.now());
        mergeServerMessages(result, [optimisticId, streamingId], attachment, analysis);
      } catch (sendError) {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticId && message.id !== streamingId),
        );
        if (sendError instanceof Error && sendError.name === "COACH_DAILY_LIMIT_REACHED") {
          setDailyUsage((current) => ({ ...current, used: current.limit, remaining: 0 }));
          feedback.showModal({
            variant: "limit",
            title: "今日对话额度已用完",
            description: dailyLimitMessage,
            primaryText: "知道了",
            dismissible: true,
          });
        } else {
          feedback.showModal({
            variant: feedbackVariantForError(sendError),
            title: "营养教练暂时无法回答",
            description: "请稍后重试。",
            primaryText: "知道了",
            dismissible: true,
          });
        }
      }
    } finally {
      if (activeStreamRef.current?.id === requestId) activeStreamRef.current = null;
      if (pageActiveRef.current) {
        setSending(false);
        void refreshCoachBrief();
      }
    }
  };

  const chooseCoachImage = async () => {
    if (sending) return;
    try {
      const result = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const picked = result.tempFiles[0];
      const path = picked?.tempFilePath;
      if (!path) throw new Error("没有获取到图片");
      setSelectedImagePath(path);
    } catch (error) {
      if (String(error).includes("cancel") || String(error).includes("取消")) return;
      feedback.show({
        message:
          error instanceof Error && error.message.includes("图片过大")
            ? error.message
            : "无法选择图片，请检查相册或相机权限",
        tone: "error",
      });
    }
  };

  const scrollToCoachTop = () => {
    void Taro.pageScrollTo({ scrollTop: 0, duration: 300 });
  };

  const handlePrimaryAction = () => {
    if (heroContext.ctaAction === "progress") {
      setExpandedSections((current) => ({ ...current, progress: true }));
      void Taro.pageScrollTo({ selector: "#coach-progress", duration: 300 });
      return;
    }
    void Taro.switchTab({ url: "/pages/meal-records/index" });
  };

  const handleScrollTopPositionChange = (event: {
    detail: ScrollTopPosition & { source: "touch" | "touch-out-of-bounds" | "out-of-bounds" | "friction" | "" };
  }) => {
    if (event.detail.source !== "touch") return;
    const nextPosition = { x: event.detail.x, y: event.detail.y };
    setScrollTopSnapAnimating(false);
    scrollTopDraggedRef.current = true;
    scrollTopPositionRef.current = nextPosition;
    setScrollTopPosition(nextPosition);
  };

  const handleScrollTopTouchEnd = () => {
    if (!scrollTopDraggedRef.current) {
      scrollToCoachTop();
      return;
    }
    scrollTopDraggedRef.current = false;
    const snappedPosition = getSnappedScrollTopPosition(scrollTopPositionRef.current);
    setScrollTopSnapAnimating(true);
    scrollTopPositionRef.current = snappedPosition;
    setScrollTopPosition(snappedPosition);
    try {
      Taro.setStorageSync(scrollTopPositionStorageKey, snappedPosition);
    } catch {
      // The new position is still retained for the current page session.
    }
  };

  return (
    <PageLayout
      activeTab="coach"
      hideNavigation
      title="你的营养教练"
      className="page-layout--coach-chat"
    >
      <View className="coach-chat">
        <View className="coach-chat__hero">
          <View className="coach-chat__hero-copy">
            <View className="coach-chat__hero-toolbar">
              <Text className="coach-chat__hero-kicker">NOVA · 今日提醒</Text>
              <View
                className="coach-chat__restart-action"
                ariaLabel="新对话"
                onClick={() => setRestartDialogOpen(true)}
              >
                <NordicIcon name="refresh-cw" size={15} ariaLabel="新对话" />
                <Text>新对话</Text>
              </View>
            </View>
            <Text className="coach-chat__hero-greeting">{greeting}，{profile.profile.nickname || "你"} 👋</Text>
            <Text className="coach-chat__hero-summary">{heroContext.summary}</Text>
            <Text className="coach-chat__hero-suggestion">{heroContext.suggestion}</Text>
            <View className="coach-chat__hero-cta" ariaLabel={heroContext.ctaLabel} onClick={handlePrimaryAction}>
              <Text>{heroContext.ctaLabel}</Text>
              <NordicIcon name="chevron-right" size={16} ariaLabel={heroContext.ctaLabel} />
            </View>
          </View>
        </View>

        <View id="coach-progress" className="coach-chat__progress-card">
          <View
            className={`coach-chat__progress-heading coach-chat__section-toggle ${
              expandedSections.progress
                ? "coach-chat__section-toggle--expanded"
                : "coach-chat__section-toggle--collapsed"
            }`}
            ariaLabel={expandedSections.progress ? "收起详细营养数据" : "展开详细营养数据"}
            onClick={() =>
              setExpandedSections((current) => ({ ...current, progress: !current.progress }))
            }
          >
            <View>
              <Text className="coach-chat__progress-kicker">今日进度</Text>
              <Text className="coach-chat__progress-title">
                {heroContext.ctaAction === "progress" ? "查看今天的营养完成度" : heroContext.summary}
              </Text>
            </View>
            <View className="coach-chat__progress-score-group">
              <Text className="coach-chat__progress-score">{summary.completion}%</Text>
              <NordicIcon
                name="chevron-right"
                size={16}
                ariaLabel={expandedSections.progress ? "收起" : "展开"}
              />
            </View>
          </View>
          {expandedSections.progress ? (
            <View className="coach-chat__progress-details">
              <View className="coach-chat__progress-tasks">
            <View className="coach-chat__progress-task">
              <Text className="coach-chat__progress-task-status">
                {heroContext.ctaAction === "progress" ? "✓" : "○"}
              </Text>
              <Text>{heroContext.ctaAction === "progress" ? "三餐已记录" : heroContext.ctaLabel}</Text>
            </View>
            <View className="coach-chat__progress-task">
              <Text className="coach-chat__progress-task-status">
                {summary.consumed.protein >= summary.protein ? "✓" : "○"}
              </Text>
              <Text>{summary.consumed.protein >= summary.protein ? "已完成蛋白目标" : "完成蛋白目标"}</Text>
            </View>
          </View>
          {[
            ["蛋白质", summary.consumed.protein, summary.protein, "g"] as const,
            ["热量", summary.consumed.calories, summary.calories, " kcal"] as const,
          ].map(([label, consumed, target, unit]) => {
            const progress = clampProgress(Number(consumed), Number(target));
            return (
              <View className="coach-chat__progress-row" key={label}>
                <View className="coach-chat__progress-row-copy">
                  <Text>{label}</Text>
                  <Text className={progress.exceeded ? "coach-chat__progress-over" : undefined}>
                    {consumed}/{target}
                    {unit}
                    {progress.exceeded ? ` · ${formatTargetStatus(progress, unit, { short: true })}` : ""}
                  </Text>
                </View>
                <View className={`coach-chat__progress-track ${progress.exceeded ? "coach-chat__progress-track--exceeded" : ""}`}>
                  <AnimatedProgressBar className="coach-chat__progress-fill animated-progress-bar" percent={progress.percent} />
                </View>
              </View>
            );
          })}
          {[["碳水", summary.consumed.carbs, summary.carbs, "g"] as const].map(([label, consumed, target, unit]) => {
                const progress = clampProgress(Number(consumed), Number(target));
                return (
                  <View className="coach-chat__progress-row" key={label}>
                    <View className="coach-chat__progress-row-copy">
                      <Text>{label}</Text>
                      <Text className={progress.exceeded ? "coach-chat__progress-over" : undefined}>
                        {consumed}/{target}
                        {unit}
                        {progress.exceeded ? ` · ${formatTargetStatus(progress, unit, { short: true })}` : ""}
                      </Text>
                    </View>
                    <View className={`coach-chat__progress-track ${progress.exceeded ? "coach-chat__progress-track--exceeded" : ""}`}>
                      <AnimatedProgressBar className="coach-chat__progress-fill animated-progress-bar" percent={progress.percent} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
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
              <NordicIcon name="milestone" size={18} ariaLabel="今日营养建议" />
              <Text>NOVA 小贴士</Text>
            </View>
            <View className="coach-chat__suggestion-actions">
              <View
                className={`coach-chat__suggestion-refresh ${dailyTipLoading ? "coach-chat__suggestion-refresh--loading" : ""}`}
                ariaLabel="换一个今日营养建议"
                onClick={(event) => {
                  event.stopPropagation();
                  void loadDailyTip(true);
                }}
              >
                <NordicIcon name="refresh-cw" size={15} ariaLabel="换一个建议" />
                <Text>换一个建议</Text>
              </View>
              <View
                className="coach-chat__suggestion-collapse"
                ariaLabel={expandedSections.suggestion ? "收起" : "展开"}
              >
                <NordicIcon name="chevron-right" size={16} ariaLabel="展开或收起" />
              </View>
            </View>
          </View>
          <Text className="coach-chat__suggestion-title">
            {dailyTipLoading ? "正在整理今日建议…" : (dailyTip ?? defaultDailyTip).headline}
          </Text>
          {expandedSections.suggestion ? (
            <>
              <Text className="coach-chat__suggestion-copy">
                {dailyTipLoading ? "正在结合你的今日记录准备一条小建议。" : (dailyTip ?? defaultDailyTip).content}
              </Text>
              <Text className="coach-chat__suggestion-reason">
                {dailyTipLoading ? "" : `推荐原因：${(dailyTip ?? defaultDailyTip).reason}`}
              </Text>
              <View
                className="coach-chat__suggestion-question"
                onClick={() => void sendMessage(heroPrompt)}
              >
                <NordicIcon name="protein" size={18} ariaLabel="营养建议延伸提问" />
                <Text>{heroPrompt}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View className="coach-chat__bottom-tools">
          <View className="coach-chat__conversation">
            {messages.map((message) => (
              <View
                key={message.id}
                className={`coach-chat__message coach-chat__message--${message.role}`}
              >
                {message.role === "coach" ? (
                  <CoachAvatar status="idle" />
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
                  {message.analysis && message.generationStatus ? (
                    <AnalysisProgress
                      analysis={message.analysis}
                      generationStatus={message.generationStatus}
                      onToggle={() => toggleAnalysis(message.id)}
                    />
                  ) : null}
                  {message.content ? (
                    <Text
                      className={
                        message.generationStatus === "answering"
                          ? "coach-chat__streaming-copy"
                          : "coach-chat__message-copy"
                      }
                    >
                      {message.content}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
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
                {quickPrompts.slice(0, 4).map((prompt) => (
                  <View
                    key={prompt}
                    className="coach-chat__quick-chip"
                    onClick={() => void sendMessage(prompt)}
                  >
                    <Text className="coach-chat__quick-chip-text">{prompt}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <Text className="coach-chat__safety-note">
            营养建议仅供日常饮食参考；营养识别与建议不构成医疗诊断或治疗建议。
          </Text>
        </View>
      </View>

      <MovableArea className="coach-chat__scroll-top-area">
        <MovableView
          className="coach-chat__scroll-top"
          direction="all"
          x={scrollTopPosition.x}
          y={scrollTopPosition.y}
          animation={scrollTopSnapAnimating}
          onChange={handleScrollTopPositionChange}
          onTouchEnd={handleScrollTopTouchEnd}
        >
          <View className="coach-chat__scroll-top-content" ariaLabel="回到顶部">
            <NordicIcon name="arrow-up" size={22} ariaLabel="回到顶部" />
          </View>
        </MovableView>
      </MovableArea>

      {dailyUsage.remaining <= 3 ? (
        <Text className="usage-quota-tip usage-quota-tip--coach">
          今日教练对话剩余 {dailyUsage.remaining} 次
        </Text>
      ) : null}

      <CoachComposer
        value={draft}
        disabled={sending || dailyUsage.remaining <= 0}
        selectedImagePath={selectedImagePath}
        onInput={setDraft}
        onSend={() => void sendMessage()}
        onPickImage={() => void chooseCoachImage()}
        onClearImage={() => setSelectedImagePath(null)}
      />
      <ConfirmDialog
        open={restartDialogOpen}
        title="新对话"
        description="当前对话会清空，历史记录仍会保留。确定重新开始吗？"
        confirmLabel="开启新对话"
        onConfirm={() => void handleRestartConversation()}
        onCancel={() => setRestartDialogOpen(false)}
      />
    </PageLayout>
  );
}
