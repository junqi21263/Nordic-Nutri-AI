import { Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";
import { NordicIcon } from "../nordic-icon";
import { useSystemLayout } from "../../hooks/useSystemLayout";

export interface AppTopBarProps extends PropsWithChildren {
  /** Show a back button on the left. Default false (tab pages). */
  showBack?: boolean;
  /** Show a home button on the left (in addition to or instead of back). */
  showHome?: boolean;
  /** Click handler for the back button. */
  onBack?: () => void;
  /** Click handler for the home button. */
  onHome?: () => void;
  /** Transparent background (no bg color). Default false. */
  transparent?: boolean;
  /** Show a bottom divider line. Default false. */
  showDivider?: boolean;
  /** Extra className for custom styling. */
  className?: string;
  /** Optional compact action rendered on the right side of the brand bar. */
  rightAction?: string;
  onRightAction?: () => void;
}

export function AppTopBar({
  showBack = false,
  showHome = false,
  onBack,
  onHome,
  transparent = false,
  showDivider = false,
  className = "",
  rightAction,
  onRightAction,
  children,
}: AppTopBarProps) {
  const layout = useSystemLayout();

  const statusBarStyle = { height: `${layout.statusBarHeight}px` };
  const navBarStyle = { height: `${layout.navigationBarHeight}px` };

  return (
    <View
      className={`app-top-bar ${transparent ? "app-top-bar--transparent" : ""} ${showDivider ? "app-top-bar--divider" : ""} ${className}`}
      style={{ zIndex: 1000 }}
    >
      <View className="app-top-bar__status-bar" style={statusBarStyle} />
      <View className="app-top-bar__nav-bar" style={navBarStyle}>
        <View
          className="app-top-bar__side app-top-bar__side--left"
          style={{ width: `${layout.rightInset}px` }}
        >
          {showBack ? (
            <View className="app-top-bar__btn" ariaLabel="返回" onClick={onBack}>
              <NordicIcon name="back" size={24} ariaLabel="返回" />
            </View>
          ) : null}
          {showHome ? (
            <View className="app-top-bar__btn" ariaLabel="首页" onClick={onHome}>
              <NordicIcon name="home" size={24} ariaLabel="首页" />
            </View>
          ) : null}
        </View>
        <View
          className="app-top-bar__brand"
          style={{ maxWidth: `${layout.titleMaxWidth}px` }}
        >
          {children ?? (
            <>
              <NordicIcon name="sparkles" size={24} ariaLabel="Nordic Nutri AI" />
              <Text className="app-top-bar__brand-text">Nordic Nutri AI</Text>
            </>
          )}
        </View>
        <View
          className="app-top-bar__side app-top-bar__side--right"
          style={{ width: `${layout.rightInset}px` }}
        >
          {rightAction ? (
            <View className="app-top-bar__right-action" ariaLabel={rightAction} onClick={onRightAction}>
              <Text>{rightAction}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
