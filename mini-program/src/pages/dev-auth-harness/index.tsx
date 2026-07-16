import { Text, View } from "@tarojs/components";
import { useMemo, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { DevelopmentAuthHarness, getAuthHarnessConfigDiagnostics } from "../../dev/auth-harness";
import {
  createAuthHarnessSnapshot,
  type AuthHarnessSnapshot,
  type HarnessStatus,
  type HarnessStep,
} from "../../dev/auth-harness-state";
import { PageLayout } from "../../layouts/page-layout";

const steps: Array<{ key: HarnessStep; label: string }> = [
  { key: "configCheck", label: "config-check" },
  { key: "wxLogin", label: "wx.login" },
  { key: "functionInvokeStart", label: "function-invoke-start" },
  { key: "functionInvokeResponse", label: "wechat-login · function-invoke-response" },
  { key: "functionErrorParse", label: "function-error-parse" },
  { key: "verifyOtp", label: "verifyOtp" },
  { key: "getUser", label: "auth.getUser" },
  { key: "profileFetch", label: "profile-fetch" },
  { key: "userSettings", label: "user_settings" },
  { key: "activeMeals", label: "active_meal_records" },
  { key: "saveMeal", label: "save-meal" },
];

const statusLabel: Record<HarnessStatus, string> = {
  idle: "未执行",
  running: "执行中",
  success: "成功",
  error: "失败",
};

export default function DevelopmentAuthHarnessPage() {
  const [snapshot, setSnapshot] = useState<AuthHarnessSnapshot>(() => createAuthHarnessSnapshot());
  const harness = useMemo(() => new DevelopmentAuthHarness(setSnapshot), []);
  const configDiagnostics = useMemo(() => getAuthHarnessConfigDiagnostics(), []);
  const isRunning = snapshot.operationStatus === "running";

  const run = (action: () => Promise<void>) => () => void action();

  return (
    <PageLayout title="开发认证验收" subtitle="仅 development 构建" showTabs={false}>
      <AppCard className="content-stack content-stack--compact">
        <Text className="section-title__title">脱敏配置检查</Text>
        <View className="list-item"><Text>supabaseUrlConfigured</Text><Text>{String(configDiagnostics.supabaseUrlConfigured)}</Text></View>
        <View className="list-item"><Text>supabaseProjectRef</Text><Text>{configDiagnostics.supabaseProjectRef ?? "—"}</Text></View>
        <View className="list-item"><Text>publishableKeyConfigured</Text><Text>{String(configDiagnostics.publishableKeyConfigured)}</Text></View>
        <View className="list-item"><Text>realAuthEnabled</Text><Text>{String(configDiagnostics.realAuthEnabled)}</Text></View>
        <View className="list-item"><Text>realBackendEnabled</Text><Text>{String(configDiagnostics.realBackendEnabled)}</Text></View>
        <View className="list-item"><Text>runtimeEnv</Text><Text>{configDiagnostics.runtimeEnv}</Text></View>
      </AppCard>

      <AppCard className="content-stack content-stack--compact">
        <Text className="section-title__title">认证阶段</Text>
        {steps.map((step) => (
          <View className="list-item" key={step.key}>
            <Text>{step.label}</Text>
            <Text>{statusLabel[snapshot.steps[step.key]]}</Text>
          </View>
        ))}
        <View className="list-item">
          <Text>当前阶段</Text>
          <Text>{snapshot.currentStage ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>Session 状态</Text>
          <Text>{snapshot.sessionStatus}</Text>
        </View>
        <View className="list-item">
          <Text>错误类型</Text>
          <Text>{snapshot.errorKind ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>错误名称</Text>
          <Text>{snapshot.errorName ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>HTTP 状态</Text>
          <Text>{snapshot.httpStatus ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>错误码</Text>
          <Text>{snapshot.errorCode ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>message</Text>
          <Text>{snapshot.message ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>requestId</Text>
          <Text>{snapshot.requestId ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>用户 ID</Text>
          <Text>{snapshot.userId ?? "—"}</Text>
        </View>
      </AppCard>

      <View className="content-stack content-stack--compact">
        <AppButton loading={isRunning} onClick={run(() => harness.login())}>执行微信登录</AppButton>
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.getSessionStatus())}>获取当前 Session 状态</AppButton>
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.currentUser())}>获取 auth.getUser</AppButton>
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.refresh())}>刷新 Session</AppButton>
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.profile())}>获取 Profile</AppButton>
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.userSettings())}>获取 user_settings</AppButton>
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.activeMeals())}>测试 active_meal_records</AppButton>
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.saveMeal())}>测试 save-meal</AppButton>
        <AppButton variant="ghost" loading={isRunning} onClick={run(() => harness.logout())}>退出登录</AppButton>
      </View>
    </PageLayout>
  );
}
