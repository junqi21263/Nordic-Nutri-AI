import type { PropsWithChildren } from "react";
import { PageLayout } from "../../layouts/page-layout";
import { PageStateSlot, type PagePreviewState } from "./page-state-slot";

export interface PageShellProps extends PropsWithChildren {
  title: string;
  subtitle: string;
  eyebrow?: string;
  state?: PagePreviewState;
}

export function PageShell({
  title,
  subtitle,
  eyebrow = "Nordic Nutri",
  state = "content",
  children,
}: PageShellProps) {
  return (
    <PageLayout eyebrow={eyebrow} title={title} subtitle={subtitle} showTabs={false}>
      <PageStateSlot state={state}>{children}</PageStateSlot>
    </PageLayout>
  );
}
