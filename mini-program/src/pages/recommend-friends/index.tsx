import { Image, Text, View } from "@tarojs/components";
import { useState } from "react";
import wechatIcon from "../../assets/icons/wechat.svg";
import { PageLayout } from "../../layouts/page-layout";
import {
  RECOMMEND_POSTER_IMAGE,
  saveRecommendPosterToAlbum,
  shareRecommendPosterToWechat,
} from "../../features/share/recommend-poster";
import { useFeedbackStore } from "../../stores/feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";

function actionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const errMsg = (error as { errMsg?: unknown }).errMsg;
    if (typeof errMsg === "string" && errMsg.trim()) return errMsg;
  }
  return "操作失败，请稍后重试";
}

export default function RecommendFriendsPage() {
  const feedback = useFeedbackStore();
  const [busy, setBusy] = useState<"wechat" | "save" | null>(null);

  const runAction = async (kind: "wechat" | "save", action: () => Promise<void>, okMessage?: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
      if (okMessage) feedback.show({ message: okMessage, tone: "success" });
    } catch (error) {
      const message = actionErrorMessage(error);
      // User dismissing the native share sheet is not an error worth toasting.
      if (/cancel|取消|fail cancel/i.test(message)) return;
      feedback.show({ message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageLayout
      title="推荐好友"
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
            ariaLabel="Nordic Nutri AI 推荐海报"
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
                ariaLabel="微信"
              />
            </View>
            <Text className="recommend-friends__action-label">微信</Text>
          </View>
          <View
            className={`recommend-friends__action ${busy === "save" ? "recommend-friends__action--busy" : ""}`}
            onClick={() =>
              void runAction("save", saveRecommendPosterToAlbum, "海报已保存到相册")
            }
          >
            <View className="recommend-friends__action-icon recommend-friends__action-icon--save">
              <Text className="recommend-friends__action-glyph">↓</Text>
            </View>
            <Text className="recommend-friends__action-label">保存</Text>
          </View>
        </View>
      </View>
    </PageLayout>
  );
}
