import { Text, View } from "@tarojs/components";
import { useAppTransitionStore } from "../../stores/app-transition-store";

export function AppTransitionOverlay() {
  const visible = useAppTransitionStore((state) => state.welcomeTransitionVisible);

  return (
    <View
      className={`app-transition-overlay ${visible ? "app-transition-overlay--visible" : ""}`}
    >
      <View className="app-transition-overlay__glow" />
      <View className="app-transition-overlay__bars">
        <View className="app-transition-overlay__bar" />
        <View className="app-transition-overlay__bar app-transition-overlay__bar--2" />
        <View className="app-transition-overlay__bar app-transition-overlay__bar--3" />
      </View>
      <Text className="app-transition-overlay__brand">Nordic Nutri AI</Text>
      <Text className="app-transition-overlay__copy">正在准备你的营养主页</Text>
    </View>
  );
}
