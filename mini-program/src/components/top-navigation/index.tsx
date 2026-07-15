import { AppHeader, type AppHeaderProps } from "../app-header";

export type TopNavigationProps = AppHeaderProps;

export function TopNavigation(props: TopNavigationProps) {
  return <AppHeader {...props} />;
}
