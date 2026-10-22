import { pauseAnalytics, trackAnalytics } from "../../features/analytics/runtime";
import { createNovaObservation } from "../../features/analytics/nova-observation";
import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { Image, Text, View } from "@tarojs/components";
import { chooseFoodImage } from "../../platform/food-media";
import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import {
  getProductCoachMessages,
  getProductCoachBrief,
  getProductCoachDailyTip,
  deleteAllProductCoachConversations,
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

const coachContextKeys: Record<string, string> = {
  "三餐已记录": "coachPage.context.allLogged",
  "午餐已记录": "coachPage.context.lunchLogged",
  "早餐已记录": "coachPage.context.breakfastLogged",
  "已完成两餐记录": "coachPage.context.twoLogged",
  "今天还没有餐次记录": "coachPage.context.noneLogged",
  "今日行动：晚间可补一份优质蛋白，帮助完成目标。": "coachPage.context.addProtein",
  "今日行动：今日摄入偏少，可适当补足主食与蛋白。": "coachPage.context.addFood",
  "今日行动：今天的营养节奏不错，继续保持。": "coachPage.context.keepGoing",
  "今日行动：早餐可按需补记。": "coachPage.context.logBreakfastLater",
  "今日行动：午餐还没记录，按自己的节奏补上。": "coachPage.context.logLunchLater",
  "今日行动：晚餐还差一餐，继续完成今天节奏。": "coachPage.context.logDinnerLater",
  "今日行动：继续记录下一餐，让今天的营养进度更完整。": "coachPage.context.logNext",
  "今日行动：今天先完成第一餐记录。": "coachPage.context.logFirst",
  "查看今日进度": "coachPage.context.viewProgress",
  "补记早餐": "coachPage.context.backfillBreakfast",
  "记录午餐": "coachPage.context.logLunch",
  "记录晚餐": "coachPage.context.logDinner",
  "记录下一餐": "coachPage.context.logNextMeal",
  "记录第一餐": "coachPage.context.logFirstMeal",
};

function localizeCoachContext(copy: string): string {
  const recorded = /^今日已记录 (\d+) 餐$/.exec(copy);
  if (recorded) return t("coachPage.context.recordedCount", { count: Number(recorded[1]) });
  const key = coachContextKeys[copy];
  return key ? t(key) : copy;
}

const greetingKeys: Record<string, string> = {
  "你好": "coachPage.greetings.hello", "夜色正静": "coachPage.greetings.quietNight", "夜深了": "coachPage.greetings.lateNight",
  "夜还很静": "coachPage.greetings.stillNight", "还没休息": "coachPage.greetings.awake", "周末早上好": "coachPage.greetings.weekendMorning",
  "早上好": "coachPage.greetings.morning", "中午好": "coachPage.greetings.noon", "下午好": "coachPage.greetings.afternoon", "晚上好": "coachPage.greetings.evening",
};

function localizeGreeting(copy: string): string {
  const key = greetingKeys[copy];
  return key ? t(key) : copy;
}

const defaultDailyUsage: ProductCoachDailyUsage = { limit: 20, used: 0, remaining: 20 };

export default function CoachPage() {
  const { i18n } = useTranslation();
  const defaultDailyTip: ProductCoachDailyTip = {
    type: "nutrition_tip",
    headline: t("coachPage.defaultTipTitle"),
    content: t("coachPage.defaultTipContent"),
    reason: t("coachPage.defaultTipReason"),
    food: null,
    source: "rule_v2",
    model: null,
  };
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
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState(() => [t("coachPage.quick1"), t("coachPage.quick2"), t("coachPage.quick3")]);
  const [heroPrompt, setHeroPrompt] = useState(() => t("coachPage.nextProtein"));
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [dailyTip, setDailyTip] = useState<ProductCoachDailyTip | null>(null);
  const [dailyTipLoading, setDailyTipLoading] = useState(false);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState<ProductCoachDailyUsage>(defaultDailyUsage);
  const [completedReplyVersion, setCompletedReplyVersion] = useState(0);
  const completedObservationRef = useRef<ReturnType<typeof createNovaObservation> | null>(null);
  const analyticsCancellationRef = useRef<"navigation_cancelled" | "background_cancelled" | undefined>(undefined);
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
        t("coachPage.proactive", { name: "Lewis", grams: proteinLeft }),
      },
  ]);
  const bottomScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToCoachBottom = () => {
    if (bottomScrollTimerRef.current) clearTimeout(bottomScrollTimerRef.current);
    bottomScrollTimerRef.current = setTimeout(() => {
      bottomScrollTimerRef.current = null;
      void Taro.pageScrollTo({ scrollTop: 999999, duration: 0 });
    }, 16);
  };

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
    completedObservationRef.current?.completed();
    completedObservationRef.current = null;
    const timer = setTimeout(() => {
      scrollToCoachBottom();
    }, 0);
    return () => clearTimeout(timer);
  }, [completedReplyVersion]);

  useEffect(() => {
    return () => {
      pageActiveRef.current = false;
      activeStreamRef.current?.abort();
      activeStreamRef.current = null;
      if (bottomScrollTimerRef.current) clearTimeout(bottomScrollTimerRef.current);
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

  useEffect(() => {
    setQuickPrompts([t("coachPage.quick1"), t("coachPage.quick2"), t("coachPage.quick3")]);
    setHeroPrompt(t("coachPage.nextProtein"));
    setDailyTip(null);
  }, [i18n.language]);

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
      t("coachPage.proactive", { name: "Lewis", grams: proteinLeft }),
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
      feedback.show({ message: t("coachPage.restartSuccess"), tone: "success" });
    } catch {
      feedback.show({ message: t("coachPage.restartFailed"), tone: "error" });
    } finally {
      setRestarting(false);
    }
  };

  const handleDeleteAllConversations = async () => {
    if (sending || restarting || deletingConversation) return;
    setDeleteAllDialogOpen(false);
    setDeletingConversation(true);
    try {
      await deleteAllProductCoachConversations();
      setMessages([createProactiveMessage()]);
      setDraft("");
      setSelectedImagePath(null);
      feedback.show({ message: t("coachPage.deleteAllSuccess"), tone: "success" });
    } catch {
      feedback.show({ message: t("coachPage.deleteFailed"), tone: "error" });
    } finally {
      setDeletingConversation(false);
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
    analyticsCancellationRef.current = typeof document !== "undefined" && document.visibilityState === "hidden" ? "background_cancelled" : "navigation_cancelled";
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
        title: t("coachPage.limitTitle"),
        description: t("coachPage.limitMessage"),
        primaryText: t("coachPage.gotIt"),
        dismissible: true,
      });
      return;
    }
    let content = userPrompt;
    let attachment: Pick<ChatMessage, "imagePath" | "imageLabel"> | undefined;
    if (imagePath) {
      try {
        const imageMeal = await analyzeProductImage(imagePath);
        content = `${userPrompt || t("coachPage.analyzeImage")}\n${t("coachPage.imageResult", { title: imageMeal.title, insight: imageMeal.insight })}`;
        attachment = { imagePath, imageLabel: t("coachPage.uploaded", { name: imageMeal.title }) };
      } catch (error) {
        const isNotConfigured = error instanceof Error && error.name === "VISION_SERVICE_NOT_CONFIGURED";
        feedback.showModal({
          variant: feedbackVariantForError(error),
          title: t(isNotConfigured ? "coachPage.imageUnavailable" : "coachPage.imageFailed"),
          description: t(isNotConfigured ? "coachPage.sendTextFirst" : "coachPage.tryLater"),
          primaryText: t("coachPage.gotIt"),
          dismissible: true,
        });
        return;
      }
    }
    const requestId = createClientRequestId();
    const releaseAnalytics = pauseAnalytics();
    const observation = createNovaObservation(trackAnalytics, requestId);
    analyticsCancellationRef.current = undefined;
    const optimisticId = "pending-" + requestId;
    const streamingId = "stream-" + requestId;
    let analysis = createAnalysisProgress(userPrompt || t("coachPage.analyzeImage"), Date.now());
    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        role: "user",
        content: userPrompt || t("coachPage.analyzeImage"),
        ...attachment,
      },
    ]);
    scrollToCoachBottom();
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
      scrollToCoachBottom();
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
            observation.delta();
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
            scrollToCoachBottom();
            return;
          }
          if (event.type === "complete") {
            completed = true;
            completedObservationRef.current = observation;
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
      if (streamError instanceof Error && streamError.name === "COACH_STREAM_ABORTED") { observation.failed(streamError, analyticsCancellationRef.current); return; }
      if (streamError instanceof Error && streamError.name === "COACH_DAILY_LIMIT_REACHED") {
        observation.failed(streamError);
        setMessages((current) => current.filter((message) => message.id !== optimisticId && message.id !== streamingId));
        setDailyUsage((current) => ({ ...current, used: current.limit, remaining: 0 }));
        feedback.showModal({
          variant: "limit",
          title: t("coachPage.limitTitle"),
          description: t("coachPage.limitMessage"),
          primaryText: t("coachPage.gotIt"),
          dismissible: true,
        });
        return;
      }
      try {
        if (process.env.TARO_ENV === "h5" && (!(streamError instanceof Error) || streamError.name !== "COACH_STREAM_UNSUPPORTED")) throw streamError;
        const result = await sendProductCoachMessage(content, date, requestId);
        if (!pageActiveRef.current) return;
        analysis = completeAnalysisForFallback(analysis, Date.now());
        completedObservationRef.current = observation;
        mergeServerMessages(result, [optimisticId, streamingId], attachment, analysis);
      } catch (sendError) {
        observation.failed(sendError, analyticsCancellationRef.current);
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticId && message.id !== streamingId),
        );
        if (sendError instanceof Error && sendError.name === "COACH_DAILY_LIMIT_REACHED") {
          setDailyUsage((current) => ({ ...current, used: current.limit, remaining: 0 }));
          feedback.showModal({
            variant: "limit",
            title: t("coachPage.limitTitle"),
            description: t("coachPage.limitMessage"),
            primaryText: t("coachPage.gotIt"),
            dismissible: true,
          });
        } else {
          feedback.showModal({
            variant: feedbackVariantForError(sendError),
            title: t("coachPage.coachUnavailable"),
            description: t("coachPage.tryLater"),
            primaryText: t("coachPage.gotIt"),
            dismissible: true,
          });
        }
      }
    } finally {
      releaseAnalytics();
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
      const path = await chooseFoodImage();
      if (!path) throw new Error("没有获取到图片");
      setSelectedImagePath(path);
    } catch (error) {
      if (String(error).includes("cancel") || String(error).includes("取消")) return;
      feedback.show({
        message:
          error instanceof Error && error.message.includes("图片过大")
            ? error.message
            : t("coachPage.imagePickFailed"),
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

  return (
    <PageLayout
      activeTab="coach"
      hideNavigation
      title={t("coachPage.title")}
      scrollLocked={restartDialogOpen || deleteAllDialogOpen}
      overlay={
        <>
          <ConfirmDialog
            open={restartDialogOpen}
            title={t("coachPage.newChat")}
            description={t("coachPage.restartQuestion")}
            confirmLabel={t("coachPage.startNewChat")}
            onConfirm={() => void handleRestartConversation()}
            onCancel={() => setRestartDialogOpen(false)}
          />
          <ConfirmDialog
            open={deleteAllDialogOpen}
            title={t("coachPage.deleteAllTitle")}
            description={t("coachPage.deleteAllQuestion")}
            confirmLabel={t("coachPage.deleteAll")}
            onConfirm={() => void handleDeleteAllConversations()}
            onCancel={() => setDeleteAllDialogOpen(false)}
          />
          <CoachComposer
            value={draft}
            disabled={sending || dailyUsage.remaining <= 0}
            selectedImagePath={selectedImagePath}
            onInput={setDraft}
            onSend={() => void sendMessage()}
            onPickImage={() => void chooseCoachImage()}
            onClearImage={() => setSelectedImagePath(null)}
          />
          <View
            className="coach-chat__scroll-top"
            ariaLabel={t("coachPage.backToTop")}
            onClick={scrollToCoachTop}
          >
            <NordicIcon name="arrow-up" size={22} ariaLabel={t("coachPage.backToTop")} />
          </View>
        </>
      }
      className="page-layout--coach-chat"
    >
      <View className="coach-chat">
        <View className="coach-chat__hero">
          <View className="coach-chat__hero-copy">
            <View className="coach-chat__hero-toolbar">
              <Text className="coach-chat__hero-kicker">{t("coachPage.todayReminder")}</Text>
              <View className="coach-chat__chat-actions">
                <View className="coach-chat__restart-action" ariaLabel={t("coachPage.newChat")} onClick={() => setRestartDialogOpen(true)}>
                  <NordicIcon name="refresh-cw" size={15} ariaLabel={t("coachPage.newChat")} />
                  <Text>{t("coachPage.newChat")}</Text>
                </View>
                <View className="coach-chat__restart-action" ariaLabel={t("coachPage.deleteAll")} onClick={() => setDeleteAllDialogOpen(true)}>
                  <Text>{t("coachPage.deleteAll")}</Text>
                </View>
              </View>
            </View>
            <Text className="coach-chat__hero-greeting">{localizeGreeting(greeting)}，{profile.profile.nickname || t("coachPage.you")} 👋</Text>
            <Text className="coach-chat__hero-summary">{localizeCoachContext(heroContext.summary)}</Text>
            <Text className="coach-chat__hero-suggestion">{localizeCoachContext(heroContext.suggestion)}</Text>
            <View className="coach-chat__hero-cta" ariaLabel={localizeCoachContext(heroContext.ctaLabel)} onClick={handlePrimaryAction}>
              <Text>{localizeCoachContext(heroContext.ctaLabel)}</Text>
              <NordicIcon name="chevron-right" size={16} ariaLabel={localizeCoachContext(heroContext.ctaLabel)} />
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
            ariaLabel={t(expandedSections.progress ? "coachPage.collapseNutrition" : "coachPage.expandNutrition")}
            onClick={() =>
              setExpandedSections((current) => ({ ...current, progress: !current.progress }))
            }
          >
            <View className="coach-chat__progress-copy">
              <Text className="coach-chat__progress-kicker">{t("coachPage.todayProgress")}</Text>
              <Text className="coach-chat__progress-title">
                {heroContext.ctaAction === "progress" ? t("coachPage.viewProgress") : localizeCoachContext(heroContext.summary)}
              </Text>
            </View>
            <View className="coach-chat__progress-score-group">
              <Text className="coach-chat__progress-score">{summary.completion}%</Text>
              <NordicIcon
                name="chevron-right"
                size={16}
                ariaLabel={t(expandedSections.progress ? "coachPage.collapse" : "coachPage.expand")}
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
              <Text>{heroContext.ctaAction === "progress" ? t("coachPage.threeMealsLogged") : localizeCoachContext(heroContext.ctaLabel)}</Text>
            </View>
            <View className="coach-chat__progress-task">
              <Text className="coach-chat__progress-task-status">
                {summary.consumed.protein >= summary.protein ? "✓" : "○"}
              </Text>
              <Text>{t(summary.consumed.protein >= summary.protein ? "coachPage.proteinGoalDone" : "coachPage.proteinGoal")}</Text>
            </View>
          </View>
          {[
            [t("nutrition.protein"), summary.consumed.protein, summary.protein, "g"] as const,
            [t("nutrition.calories"), summary.consumed.calories, summary.calories, " kcal"] as const,
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
          {[[t("nutrition.carbs"), summary.consumed.carbs, summary.carbs, "g"] as const].map(([label, consumed, target, unit]) => {
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
            ariaLabel={t(expandedSections.suggestion ? "coachPage.collapseSuggestion" : "coachPage.expandSuggestion")}
            onClick={() =>
              setExpandedSections((current) => ({ ...current, suggestion: !current.suggestion }))
            }
          >
            <View className="coach-chat__suggestion-label">
              <NordicIcon name="milestone" size={18} ariaLabel={t("coachPage.tips")} />
              <Text>{t("coachPage.tips")}</Text>
            </View>
            <View className="coach-chat__suggestion-actions">
              <View
                className={`coach-chat__suggestion-refresh ${dailyTipLoading ? "coach-chat__suggestion-refresh--loading" : ""}`}
                ariaLabel={t("coachPage.refreshTip")}
                onClick={(event) => {
                  event.stopPropagation();
                  void loadDailyTip(true);
                }}
              >
                <NordicIcon name="refresh-cw" size={15} ariaLabel={t("coachPage.refreshTip")} />
                <Text>{t("coachPage.refreshTip")}</Text>
              </View>
              <View
                className="coach-chat__suggestion-collapse"
                ariaLabel={t(expandedSections.suggestion ? "coachPage.collapse" : "coachPage.expand")}
              >
                <NordicIcon name="chevron-right" size={16} ariaLabel={t("coachPage.expand")} />
              </View>
            </View>
          </View>
          <Text className="coach-chat__suggestion-title">
            {dailyTipLoading ? t("coachPage.tipLoading") : (dailyTip ?? defaultDailyTip).headline}
          </Text>
          {expandedSections.suggestion ? (
            <>
              <Text className="coach-chat__suggestion-copy">
                {dailyTipLoading ? t("coachPage.tipLoadingDetail") : (dailyTip ?? defaultDailyTip).content}
              </Text>
              <Text className="coach-chat__suggestion-reason">
                {dailyTipLoading ? "" : t("coachPage.reason", { reason: (dailyTip ?? defaultDailyTip).reason })}
              </Text>
              <View
                className="coach-chat__suggestion-question"
                onClick={() => void sendMessage(heroPrompt)}
              >
                <NordicIcon name="protein" size={18} ariaLabel={t("coachPage.quickQuestions")} />
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
              ariaLabel={t(expandedSections.quickReplies ? "coachPage.collapseQuick" : "coachPage.expandQuick")}
              onClick={() =>
                setExpandedSections((current) => ({
                  ...current,
                  quickReplies: !current.quickReplies,
                }))
              }
            >
              <Text className="coach-chat__quick-title">{t("coachPage.quickQuestions")}</Text>
              <NordicIcon
                name="chevron-right"
                size={16}
                ariaLabel={t(expandedSections.quickReplies ? "coachPage.collapse" : "coachPage.expand")}
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
            {t("coachPage.disclaimer")}
          </Text>
        </View>
      </View>

      {dailyUsage.remaining <= 3 ? (
        <Text className="usage-quota-tip usage-quota-tip--coach">
          {t("coachPage.remaining", { count: dailyUsage.remaining })}
        </Text>
      ) : null}

    </PageLayout>
  );
}
