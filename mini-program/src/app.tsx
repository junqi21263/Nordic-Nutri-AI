import { QueryClientProvider } from "@tanstack/react-query";
import Taro, { useLaunch } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { queryClient } from "./api/query-client";
import { AppLayout } from "./layouts/app-layout";
import { FeedbackHost } from "./components/feedback-host";
import { isOnboardingCompleted } from "./utils/local-experience";
import "./app.scss";

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    if (isOnboardingCompleted()) {
      void Taro.switchTab({ url: "/pages/home/index" });
    }
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout>
        {children}
        <FeedbackHost />
      </AppLayout>
    </QueryClientProvider>
  );
}
