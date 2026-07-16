import { Text, View } from "@tarojs/components";
import { useMemo, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import {
  DevelopmentAuthHarness,
  getAuthHarnessConfigDiagnostics,
  getAuthHarnessRuntimeDiagnostics,
} from "../../dev/auth-harness";
import {
  createAuthHarnessSnapshot,
  type AuthHarnessSnapshot,
  type HarnessStatus,
  type HarnessStep,
} from "../../dev/auth-harness-state";
import type { InitializationProbeStep } from "../../dev/supabase-initialization-probe";
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

const initializationSteps: Array<{ key: InitializationProbeStep; label: string }> = [
  { key: "configNormalize", label: "config-normalize" },
  { key: "urlConstructor", label: "url-constructor" },
  { key: "createClientMinimal", label: "create-client-minimal" },
  { key: "storageAdapter", label: "storage-adapter" },
  { key: "createClientStorage", label: "create-client-storage" },
  { key: "createClientRefresh", label: "create-client-refresh" },
  { key: "createClientFull", label: "create-client-full" },
  { key: "functionInvoke", label: "function-invoke" },
];

export default function DevelopmentAuthHarnessPage() {
  const [snapshot, setSnapshot] = useState<AuthHarnessSnapshot>(() => createAuthHarnessSnapshot());
  const harness = useMemo(() => new DevelopmentAuthHarness(setSnapshot), []);
  const configDiagnostics = useMemo(() => getAuthHarnessConfigDiagnostics(), []);
  const runtimeDiagnostics = useMemo(() => getAuthHarnessRuntimeDiagnostics(), []);
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
        <Text className="section-title__title">初始化矩阵</Text>
        {initializationSteps.map((step) => (
          <View className="list-item" key={step.key}>
            <Text>{step.label}</Text>
            <Text>{statusLabel[snapshot.initializationMatrix[step.key].status]}</Text>
          </View>
        ))}
      </AppCard>

      <AppCard className="content-stack content-stack--compact">
        <Text className="section-title__title">运行时能力检查</Text>
        <View className="list-item"><Text>globalThis.fetch</Text><Text>{runtimeDiagnostics.fetch}</Text></View>
        <View className="list-item"><Text>globalThis.Headers</Text><Text>{runtimeDiagnostics.Headers}</Text></View>
        <View className="list-item"><Text>globalThis.Request</Text><Text>{runtimeDiagnostics.Request}</Text></View>
        <View className="list-item"><Text>globalThis.Response</Text><Text>{runtimeDiagnostics.Response}</Text></View>
        <View className="list-item"><Text>globalThis.URL</Text><Text>{runtimeDiagnostics.URL}</Text></View>
        <View className="list-item"><Text>globalThis.AbortController</Text><Text>{runtimeDiagnostics.AbortController}</Text></View>
        <View className="list-item"><Text>wx.request</Text><Text>{runtimeDiagnostics.wxRequest}</Text></View>
        <View className="list-item"><Text>wx.getStorage</Text><Text>{runtimeDiagnostics.wxGetStorage}</Text></View>
        <View className="list-item"><Text>wx.setStorage</Text><Text>{runtimeDiagnostics.wxSetStorage}</Text></View>
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
          <Text>初始化阶段</Text>
          <Text>{snapshot.initializationStage ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>cause.name</Text>
          <Text>{snapshot.causeName ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>cause.message</Text>
          <Text>{snapshot.causeMessage ?? "—"}</Text>
        </View>
        <View className="list-item">
          <Text>缺失能力</Text>
          <Text>{snapshot.missingCapability ?? "—"}</Text>
        </View>
        <View className="list-item"><Text>raw error.name</Text><Text>{snapshot.rawErrorName ?? "—"}</Text></View>
        <View className="list-item"><Text>raw error.message</Text><Text>{snapshot.rawErrorMessage ?? "—"}</Text></View>
        <View className="list-item"><Text>raw cause.name</Text><Text>{snapshot.rawCauseName ?? "—"}</Text></View>
        <View className="list-item"><Text>raw cause.message</Text><Text>{snapshot.rawCauseMessage ?? "—"}</Text></View>
        <View className="list-item"><Text>抛错文件</Text><Text>{snapshot.errorFile ?? "—"}</Text></View>
        <View className="list-item"><Text>抛错函数</Text><Text>{snapshot.errorFunction ?? "—"}</Text></View>
        {snapshot.stackFrames.map((frame, index) => <View className="list-item" key={`${frame}-${index}`}><Text>stack {index + 1}</Text><Text>{frame}</Text></View>)}
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
        <AppButton variant="outline" loading={isRunning} onClick={run(() => harness.runInitializationProbe())}>运行初始化诊断</AppButton>
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
