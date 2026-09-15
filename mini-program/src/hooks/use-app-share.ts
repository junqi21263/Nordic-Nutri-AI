import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { buildAppShareMessage, buildAppTimelineShare } from "../features/share/app-share";

const isWeChatRuntime = process.env.TARO_ENV === "weapp";

type SharePage = {
  onShareAppMessage?: () => ReturnType<typeof buildAppShareMessage>;
  onShareTimeline?: () => ReturnType<typeof buildAppTimelineShare>;
};

function bindPageShareHandlers(path?: string) {
  const page = Taro.getCurrentInstance().page as SharePage | null | undefined;
  if (!page) return;
  // Imperative bind: useShareAppMessage in nested layouts is unreliable on real devices.
  page.onShareAppMessage = () => buildAppShareMessage(path);
  page.onShareTimeline = () => buildAppTimelineShare();
}

/** Call from the page component itself (not only a child layout). */
export function useAppShare(path?: string) {
  useShareAppMessage(() => buildAppShareMessage(path));
  useShareTimeline(() => buildAppTimelineShare());

  useDidShow(() => {
    if (!isWeChatRuntime) return;
    bindPageShareHandlers(path);
    void Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ["shareAppMessage", "shareTimeline"],
    }).catch(() => undefined);
  });
}
