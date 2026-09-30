import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { useMenuButtonMetrics } from "../../utils/use-menu-button-metrics";

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  leading?: string;
  action?: string;
  onLeadingClick?: () => void;
  onActionClick?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  eyebrow,
  leading,
  action,
  onLeadingClick,
  onActionClick,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const metrics = useMenuButtonMetrics();
  return (
    <View className="app-header top-navigation" style={{ paddingRight: `${metrics.rightInset}px` }}>
      <View className="top-navigation__leading">
        {leading ? (
          <View
            className="top-navigation__action"
            ariaLabel={leading === "‹" ? t("common.back") : leading}
            onClick={onLeadingClick}
          >
            {leading}
          </View>
        ) : null}
        <View>
          {eyebrow ? <Text className="top-navigation__eyebrow">{eyebrow}</Text> : null}
          <Text className="top-navigation__title">{title}</Text>
          {subtitle ? <Text className="top-navigation__subtitle">{subtitle}</Text> : null}
        </View>
      </View>
      {action ? (
        <View className="top-navigation__actions">
          <View className="top-navigation__action" ariaLabel={action} onClick={onActionClick}>
            {action}
          </View>
        </View>
      ) : null}
    </View>
  );
}
