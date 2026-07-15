import Taro from "@tarojs/taro";
import { shouldNavigateBack } from "./navigation-intent";

export { shouldNavigateBack } from "./navigation-intent";

/** Keeps a direct-opened page inside the local MVP instead of leaving the mini-program. */
export function navigateBackOrHome(fallback = "/pages/home/index") {
  if (shouldNavigateBack(Taro.getCurrentPages().length)) {
    void Taro.navigateBack();
    return;
  }
  void Taro.reLaunch({ url: fallback });
}
