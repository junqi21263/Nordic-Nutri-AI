import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import Taro from "@tarojs/taro";
import { NordicIcon, type NordicIconName } from "../nordic-icon";
import { useTabBarStore } from "../../stores/tab-bar-store";
import { useSystemLayout } from "../../hooks/useSystemLayout";

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
  { key: "home", label: "", icon: "home" },
  { key: "food-scanner", label: "", icon: "scan-line" },
  { key: "meal-records", label: "", icon: "list-checks" },
  { key: "food-catalog", label: "", icon: "food-bowl" },
  { key: "coach", label: "", icon: "bot" },
  { key: "profile", label: "", icon: "user-round" },
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
  const { t } = useTranslation();
  const layout = useSystemLayout();
  const localizedItems = items === defaultItems ? items.map(item => ({ ...item, label: t(`tabs.${item.key}`) })) : items;
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
    <View
      className="bottom-tab-bar"
      style={{
        height: `calc(${layout.tabBarHeight}px + ${layout.safeBottom}px)`,
        paddingBottom: `${layout.safeBottom}px`,
      }}
    >
      {localizedItems.map((item) => (
        <View
          className={`bottom-tab-bar__item ${item.key === activeKey ? "bottom-tab-bar__item--active" : ""}`}
          hoverClass="pressable--active"
          hoverStayTime={70}
          key={item.key}
          ariaLabel={item.label}
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
