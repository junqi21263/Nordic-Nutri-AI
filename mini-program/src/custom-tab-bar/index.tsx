import { BottomTabBar } from "../components/bottom-tab-bar";
import { useTabBarStore } from "../stores/tab-bar-store";

function CustomTabBar() {
  const activeKey = useTabBarStore((state) => state.activeKey);
  const visible = useTabBarStore((state) => state.visible);
  return visible ? <BottomTabBar activeKey={activeKey} /> : null;
}

CustomTabBar.options = {
  addGlobalClass: true,
};

export default CustomTabBar;
