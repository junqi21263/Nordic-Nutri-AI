import { QueryClientProvider } from "@tanstack/react-query";
import Taro, { useLaunch, useDidShow } from "@tarojs/taro";
import { getLocale, refreshSystemLanguage } from "./i18n";
import type { PropsWithChildren } from "react";
import { queryClient } from "./api/query-client";
import { AppLayout } from "./layouts/app-layout";
import { startApplicationAuth } from "./auth/app-auth-bootstrap";
import { initializeAndroidSmartReminders } from "./features/smart-reminders/coordinator";
import { initializeAndroidPushNotifications } from "./features/smart-reminders/push-coordinator";
import { useAuthStore } from "./auth/auth-store";
import { smartReminderStorage } from "./features/smart-reminders/storage";
import { syncSmartReminderSchedule } from "./api/push-api";
import { AppTransitionOverlay } from "./components/app-transition-overlay";
import { AppUpdateDialog } from "./components/app-update-dialog";
import "./app.scss";

let devConsoleStarted = false;
let lastReminderLocaleSync: { userId: string; locale: string } | null = null;

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
  useDidShow(() => {
    void (async () => {
      await refreshSystemLanguage();
      const userId = useAuthStore.getState().user?.id;
      if (!userId) return;
      const locale = getLocale();
      if (lastReminderLocaleSync?.userId === userId && lastReminderLocaleSync.locale === locale) return;
      try {
        await syncSmartReminderSchedule(smartReminderStorage.load(userId), locale);
        lastReminderLocaleSync = { userId, locale };
        await initializeAndroidSmartReminders();
      } catch {
        // Retry on the next app foreground; language selection remains local-first.
      }
    })();
  });
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
        <AppUpdateDialog />
      </AppLayout>
    </QueryClientProvider>
  );
}
