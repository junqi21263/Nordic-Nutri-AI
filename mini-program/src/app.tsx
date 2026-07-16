import { QueryClientProvider } from "@tanstack/react-query";
import { useLaunch } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { queryClient } from "./api/query-client";
import { AppLayout } from "./layouts/app-layout";
import { FeedbackHost } from "./components/feedback-host";
import { startApplicationAuth } from "./auth/app-auth-bootstrap";
import "./app.scss";

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    void startApplicationAuth();
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
