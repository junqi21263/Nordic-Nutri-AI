import { Image, Text, View } from "@tarojs/components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import wechatIcon from "../../assets/icons/wechat.svg";
import { PageLayout } from "../../layouts/page-layout";
import {
  RECOMMEND_POSTER_IMAGE,
  saveRecommendPosterToAlbum,
  shareRecommendPosterToWechat,
} from "../../features/share/recommend-poster";
import { useFeedbackStore } from "../../stores/feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";

function actionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const errMsg = (error as { errMsg?: unknown }).errMsg;
    if (typeof errMsg === "string" && errMsg.trim()) return errMsg;
  }
  return fallback;
}

export default function RecommendFriendsPage() {
  const { t } = useTranslation();
  const feedback = useFeedbackStore();
  const [busy, setBusy] = useState<"wechat" | "save" | null>(null);

  const runAction = async (kind: "wechat" | "save", action: () => Promise<void>, okMessage?: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
      if (okMessage) feedback.show({ message: okMessage, tone: "success" });
    } catch (error) {
      const message = actionErrorMessage(error, t("recommendFriends.actionFailed"));
      // User dismissing the native share sheet is not an error worth toasting.
      if (/cancel|取消|fail cancel/i.test(message)) return;
      feedback.show({ message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageLayout
      title={t("recommendFriends.title")}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => navigateBackOrHome("/pages/profile/index")}
      className="page-layout--recommend-friends"
    >
      <View className="recommend-friends">
        <View className="recommend-friends__preview">
          <Image
            className="recommend-friends__poster"
            src={RECOMMEND_POSTER_IMAGE}
            mode="widthFix"
            showMenuByLongpress
            ariaLabel={t("recommendFriends.posterAlt")}
          />
        </View>

        <View className="recommend-friends__actions">
          <View
            className={`recommend-friends__action ${busy === "wechat" ? "recommend-friends__action--busy" : ""}`}
            onClick={() => void runAction("wechat", shareRecommendPosterToWechat)}
          >
            <View className="recommend-friends__action-icon recommend-friends__action-icon--wechat">
              <Image
                className="recommend-friends__wechat-logo"
                src={wechatIcon}
                mode="aspectFit"
                ariaLabel={t("recommendFriends.wechat")}
              />
            </View>
            <Text className="recommend-friends__action-label">{t("recommendFriends.wechat")}</Text>
          </View>
          <View
            className={`recommend-friends__action ${busy === "save" ? "recommend-friends__action--busy" : ""}`}
            onClick={() =>
              void runAction("save", saveRecommendPosterToAlbum, t("recommendFriends.saved"))
            }
          >
            <View className="recommend-friends__action-icon recommend-friends__action-icon--save">
              <Text className="recommend-friends__action-glyph">↓</Text>
            </View>
            <Text className="recommend-friends__action-label">{t("recommendFriends.save")}</Text>
          </View>
        </View>
      </View>
    </PageLayout>
  );
}
