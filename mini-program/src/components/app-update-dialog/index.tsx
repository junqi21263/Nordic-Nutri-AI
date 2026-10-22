import { trackAnalytics } from "../../features/analytics/runtime";
import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { AppButton } from "../app-button";
import { Modal } from "../modal";
import { installVerifiedApk, openNativeMarket } from "../../features/app-update/native";
import { useAppUpdateStore } from "../../features/app-update/store";
import "./index.scss";

export function AppUpdateDialog() {
  const { t } = useTranslation();
  const { release, phase, progress, dismiss, setProgress } = useAppUpdateStore();
  if (!release) return null;
  const busy = phase === "downloading" || phase === "verified" || phase === "installing";
  const status = phase === "downloading"
    ? t("appUpdate.status.downloading", { progress })
    : phase === "verified" ? t("appUpdate.status.verified")
      : phase === "installing" ? t("appUpdate.status.installing")
        : phase === "permission_required" ? t("appUpdate.status.permission")
          : phase === "failed" ? t("appUpdate.status.failed")
            : "";
  const download = () => {
    if (!release.apkUrl || !release.apkSha256) return;
    trackAnalytics("update_clicked", { target_version: release.versionName });
    if (installVerifiedApk(release.apkUrl, release.apkSha256, release.versionCode, release.versionName)) setProgress("downloading", 0);
    else setProgress("failed", 0);
  };
  return (
    <Modal open lockScroll>
      <View className="app-update-dialog">
        <Text className="app-update-dialog__eyebrow">NORDIC UPDATE</Text>
        <Text className="app-update-dialog__title">{t("appUpdate.title", { version: release.versionName })}</Text>
        <View className="app-update-dialog__notes">
          {(release.releaseNotes.length ? release.releaseNotes : [t("appUpdate.defaultNote")]).map((note) => (
            <Text className="app-update-dialog__note" key={note}>• {note}</Text>
          ))}
        </View>
        {status ? <Text className="app-update-dialog__status">{status}</Text> : null}
        <View className="app-update-dialog__actions">
          {release.marketUrl ? (
            <AppButton disabled={busy} onClick={() => { trackAnalytics("update_clicked", { target_version: release.versionName }); openNativeMarket(release.marketUrl!); }}>{t("appUpdate.market")}</AppButton>
          ) : null}
          {release.apkUrl && release.apkSha256 ? (
            <AppButton variant={release.marketUrl ? "outline" : "primary"} loading={busy} onClick={download}>
              {t(phase === "failed" || phase === "permission_required" ? "appUpdate.retryInstall" : "appUpdate.download")}
            </AppButton>
          ) : null}
          <AppButton variant="ghost" disabled={busy} onClick={dismiss}>{t("appUpdate.later")}</AppButton>
        </View>
      </View>
    </Modal>
  );
}
