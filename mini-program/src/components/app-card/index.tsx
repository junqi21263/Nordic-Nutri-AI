import { Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

export interface AppCardProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  tone?: "default" | "beige" | "sage" | "dark";
  className?: string;
  active?: boolean;
  flat?: boolean;
}

export function AppCard({
  title,
  subtitle,
  tone = "default",
  className = "",
  active = false,
  flat = false,
  children,
}: AppCardProps) {
  return (
    <View
      className={`app-card app-card--${tone} ${active ? "app-card--active" : ""} ${flat ? "app-card--flat" : ""} ${className}`}
    >
      {title ? <Text className="section-title__title">{title}</Text> : null}
      {subtitle ? <Text className="top-navigation__subtitle">{subtitle}</Text> : null}
      {children}
    </View>
  );
}
