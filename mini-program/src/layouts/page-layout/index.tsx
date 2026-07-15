import { View } from "@tarojs/components";
import { useEffect, type PropsWithChildren } from "react";
import { AppSafeArea } from "../../components/app-safe-area";
import { TopNavigation } from "../../components/top-navigation";
import { useTabBarStore } from "../../stores/tab-bar-store";

export interface PageLayoutProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  activeTab?: string;
  showTabs?: boolean;
  leading?: string;
  action?: string;
  onLeadingClick?: () => void;
  onActionClick?: () => void;
  /** Allows a Stitch composition to provide its own compact navigation region. */
  hideNavigation?: boolean;
  className?: string;
}

export function PageLayout({
  title,
  subtitle,
  eyebrow,
  activeTab,
  showTabs = true,
  leading,
  action,
  onLeadingClick,
  onActionClick,
  hideNavigation = false,
  className,
  children,
}: PageLayoutProps) {
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);

  useEffect(() => {
    if (showTabs) setActiveKey(activeTab ?? "home");
  }, [activeTab, setActiveKey, showTabs]);

  return (
    <AppSafeArea
      className={[
        "page-layout",
        showTabs ? "" : "page-layout--without-tabs",
        hideNavigation ? "page-layout--custom-navigation" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <View className="page-layout__scroll">
        <View className="page-layout__content page-layout__content--enter">
          {!hideNavigation ? (
            <TopNavigation
              title={title}
              subtitle={subtitle}
              eyebrow={eyebrow}
              leading={leading}
              action={action}
              onLeadingClick={onLeadingClick}
              onActionClick={onActionClick}
            />
          ) : null}
          <View className="content-stack">{children}</View>
        </View>
      </View>
    </AppSafeArea>
  );
}
