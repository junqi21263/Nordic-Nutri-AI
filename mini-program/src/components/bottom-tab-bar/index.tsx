import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { NordicIcon, type NordicIconName } from "../nordic-icon";
import { useTabBarStore } from "../../stores/tab-bar-store";

export interface BottomTabItem {
  key: string;
  label: string;
  icon: NordicIconName;
}
export interface BottomTabBarProps {
  activeKey: string;
  items?: BottomTabItem[];
}

const defaultItems: BottomTabItem[] = [
  { key: "home", label: "首页", icon: "home" },
  { key: "food-scanner", label: "扫描", icon: "scan-line" },
  { key: "meal-records", label: "记录", icon: "list-checks" },
  { key: "food-catalog", label: "食物库", icon: "food-bowl" },
  { key: "coach", label: "教练", icon: "bot" },
  { key: "profile", label: "我的", icon: "user-round" },
];

const routeByKey: Record<string, string> = {
  home: "/pages/home/index",
  "food-scanner": "/pages/food-scanner/index",
  "meal-records": "/pages/meal-records/index",
  "food-catalog": "/pages/food-catalog/index",
  coach: "/pages/coach/index",
  profile: "/pages/profile/index",
};

export function BottomTabBar({ activeKey, items = defaultItems }: BottomTabBarProps) {
  const navigate = (key: string) => {
    const route = routeByKey[key];
    if (route && key !== activeKey) {
      useTabBarStore.getState().setActiveKey(key);
      if (key === "food-scanner") {
        // Use navigateTo (not reLaunch) so the current tab page stays alive
        // underneath. reLaunch destroys ALL pages causing a full white screen.
        void Taro.navigateTo({ url: route });
        return;
      }
      void Taro.switchTab({ url: route });
    }
  };
  return (
    <View className="bottom-tab-bar">
      {items.map((item) => (
        <View
          className={`bottom-tab-bar__item ${item.key === activeKey ? "bottom-tab-bar__item--active" : ""}`}
          hoverClass="pressable--active"
          hoverStayTime={70}
          key={item.key}
          ariaLabel={`切换到${item.label}`}
          onClick={() => navigate(item.key)}
        >
          <View className="bottom-tab-bar__icon">
            <NordicIcon name={item.icon} size={22} ariaLabel={item.label} />
          </View>
          <Text>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
