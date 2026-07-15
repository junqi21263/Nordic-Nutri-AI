import type { PropsWithChildren } from "react";
import { EmptyState } from "../../components/empty-state";
import { ErrorState } from "../../components/error-state";
import { LoadingState } from "../../components/loading-state";

export type PagePreviewState = "content" | "loading" | "empty" | "error";

export function PageStateSlot({
  state,
  children,
}: PropsWithChildren<{ state?: PagePreviewState }>) {
  if (state === "loading") return <LoadingState />;
  if (state === "empty") return <EmptyState />;
  if (state === "error") return <ErrorState />;
  return <>{children}</>;
}
