import { Text, View } from "@tarojs/components";
import { AppButton } from "../app-button";
import { Modal } from "../modal";
import { installVerifiedApk, openNativeMarket } from "../../features/app-update/native";
import { useAppUpdateStore } from "../../features/app-update/store";
import "./index.scss";

export function AppUpdateDialog() {
  const { release, phase, progress, dismiss, setProgress } = useAppUpdateStore();
  if (!release) return null;
  const busy = phase === "downloading" || phase === "verified" || phase === "installing";
  const status = phase === "downloading"
    ? `正在安全下载 ${progress}%`
    : phase === "verified" ? "安装包校验完成"
      : phase === "installing" ? "正在打开系统安装器"
        : phase === "permission_required" ? "请允许安装此来源的应用后重试"
          : phase === "failed" ? "下载或安装未完成，请重试"
            : "";
  const download = () => {
    if (!release.apkUrl || !release.apkSha256) return;
    if (installVerifiedApk(release.apkUrl, release.apkSha256)) setProgress("downloading", 0);
    else setProgress("failed", 0);
  };
  return (
    <Modal open lockScroll>
      <View className="app-update-dialog">
        <Text className="app-update-dialog__eyebrow">NORDIC UPDATE</Text>
        <Text className="app-update-dialog__title">发现新版本 {release.versionName}</Text>
        <View className="app-update-dialog__notes">
          {(release.releaseNotes.length ? release.releaseNotes : ["体验与稳定性改进"]).map((note) => (
            <Text className="app-update-dialog__note" key={note}>• {note}</Text>
          ))}
        </View>
        {status ? <Text className="app-update-dialog__status">{status}</Text> : null}
        <View className="app-update-dialog__actions">
          {release.marketUrl ? (
            <AppButton disabled={busy} onClick={() => openNativeMarket(release.marketUrl!)}>前往应用市场</AppButton>
          ) : null}
          {release.apkUrl && release.apkSha256 ? (
            <AppButton variant={release.marketUrl ? "outline" : "primary"} loading={busy} onClick={download}>
              {phase === "failed" || phase === "permission_required" ? "重新下载并安装" : "直接下载 APK"}
            </AppButton>
          ) : null}
          <AppButton variant="ghost" disabled={busy} onClick={dismiss}>稍后再说</AppButton>
        </View>
      </View>
    </Modal>
  );
}
