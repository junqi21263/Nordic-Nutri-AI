import { QueryClientProvider } from "@tanstack/react-query";
import Taro, { useLaunch } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { queryClient } from "./api/query-client";
import { AppLayout } from "./layouts/app-layout";
import { startApplicationAuth } from "./auth/app-auth-bootstrap";
import { initializeAndroidSmartReminders } from "./features/smart-reminders/coordinator";
import { initializeAndroidPushNotifications } from "./features/smart-reminders/push-coordinator";
import { AppTransitionOverlay } from "./components/app-transition-overlay";
import "./app.scss";

let devConsoleStarted = false;

async function startAndroidDevConsole() {
  if (devConsoleStarted || process.env.TARO_APP_PLATFORM !== "android" || process.env.TARO_APP_ENV !== "development") return;
  devConsoleStarted = true;
  try {
    const { default: VConsole } = await import("vconsole");
    new VConsole();
  } catch {
    // Debug tooling must never prevent the application from rendering.
  }
}

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    if (process.env.TARO_APP_PLATFORM === "android") {
      void startAndroidDevConsole();
      void initializeAndroidSmartReminders();
      void Taro.reLaunch({ url: "/pages/welcome/index" }).then(() => initializeAndroidPushNotifications());
      return;
    }
    void startAndroidDevConsole().then(() => startApplicationAuth());
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout>
        {children}
        <AppTransitionOverlay />
      </AppLayout>
    </QueryClientProvider>
  );
}
