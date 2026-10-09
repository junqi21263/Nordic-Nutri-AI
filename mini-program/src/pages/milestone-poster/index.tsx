import { Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  confirmMilestonePresentation,
  getPresentedMilestoneEvent,
  recordMilestoneShare,
} from "../../api/milestone-api";
import { MilestonePoster } from "../../components/milestone-poster";
import { MilestoneStageGallery } from "../../components/milestone-stage-gallery";
import { MilestonePosterCanvas, type MilestonePosterExporter } from "../../components/milestone-poster-canvas";
import { MilestoneSharePreview } from "../../components/milestone-share-preview";
import { isMilestonePreviewDevelopmentBuild } from "../../features/milestones/development-preview";
import { getMilestoneFixture } from "../../features/milestones/fixture";
import { resolveMilestoneIllustrationSource } from "../../features/milestones/asset-cache";
import { toMilestonePosterPresentation, type MilestoneSnapshot } from "../../features/milestones/snapshot";
import { createTaroMilestoneIllustrationTransport } from "../../features/milestones/taro-asset-transport";
import type { MilestonePosterProps } from "../../components/milestone-poster";
import { PageLayout } from "../../layouts/page-layout";
import { useSystemLayout } from "../../hooks/useSystemLayout";
import { navigateBackOrHome } from "../../utils/navigation";

type PageState =
  | { kind: "loading" }
  | { kind: "ready"; poster: MilestonePosterProps; eventId: string }
  | { kind: "error"; message: string };

type IllustrationState =
  | { kind: "idle" | "loading"; source: null }
  | { kind: "ready"; source: string }
  | { kind: "error"; source: null };

function getErrorMessage(reason: unknown, translate: (key: string) => string) {
  const message = reason instanceof Error ? reason.message : "";
  if (message === "该里程碑尚未可回看") return translate("milestonePoster.notReady");
  for (const key of ["generating", "unsupportedShare", "brandAssetFailed", "qrAssetFailed", "illustrationFailed"] as const) {
    const translated = translate(`milestonePoster.${key}`);
    if (message === translated) return translated;
  }
  return translate("milestonePoster.loadFailed");
}

export default function MilestonePosterPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const layout = useSystemLayout();
  const eventId = router.params.eventId;
  const claimToken = router.params.claimToken;
  const isDemo = router.params.demo === "1" && isMilestonePreviewDevelopmentBuild;
  const demoMilestone = Number(router.params.milestone);
  const [state, setState] = useState<PageState>(() => {
    if (isDemo && [3, 7, 14, 30].includes(demoMilestone)) {
      return { kind: "ready", poster: getMilestoneFixture(demoMilestone as 3 | 7 | 14 | 30), eventId: "demo" };
    }
    return { kind: "loading" };
  });
  const [exporter, setExporter] = useState<MilestonePosterExporter | null>(null);
  const [sharePreviewPath, setSharePreviewPath] = useState<string | null>(null);
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [sharePreviewBusy, setSharePreviewBusy] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [illustrationState, setIllustrationState] = useState<IllustrationState>({ kind: "idle", source: null });
  const handleExporterReady = useCallback((nextExporter: MilestonePosterExporter) => {
    setExporter(() => nextExporter);
  }, []);
  const requestKey = `${isDemo ? "demo" : "event"}:${eventId ?? ""}:${claimToken ?? ""}`;
  const initializedKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (isDemo && [3, 7, 14, 30].includes(demoMilestone)) {
      setState({ kind: "ready", poster: getMilestoneFixture(demoMilestone as 3 | 7 | 14 | 30), eventId: "demo" });
      return;
    }
    if (!eventId) {
      setState({ kind: "error", message: t("milestonePoster.missingEvent") });
      return;
    }
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    try {
      let snapshot: MilestoneSnapshot;
      if (claimToken) {
        // Confirm is idempotent: retrying after a dropped response returns the same frozen snapshot.
        snapshot = await confirmMilestonePresentation(eventId, claimToken);
      } else {
        const event = await getPresentedMilestoneEvent(eventId);
        if (!event.presentation_snapshot) throw new Error("该里程碑尚未可回看");
        snapshot = event.presentation_snapshot;
      }
      setState({
        kind: "ready",
        poster: toMilestonePosterPresentation(snapshot),
        eventId,
      });
    } catch (reason) {
      setState({ kind: "error", message: getErrorMessage(reason, (key) => String(t(key))) });
    }
  }, [claimToken, demoMilestone, eventId, isDemo, t]);

  useEffect(() => {
    if (initializedKey.current === requestKey) return;
    initializedKey.current = requestKey;
    setExporter(null);
    void load();
  }, [load, requestKey]);

  const poster = state.kind === "ready" ? state.poster : null;
  const illustrationKey = poster?.illustrationAsset
    ? `${poster.illustrationAsset.id}:${poster.illustrationAsset.version}`
    : "";
  const resolveIllustration = useCallback(async (nextPoster: MilestonePosterProps) => {
    const asset = nextPoster.illustrationAsset;
    if (!asset) {
      setIllustrationState({ kind: "error", source: null });
      return;
    }
    setIllustrationState({ kind: "loading", source: null });
    setExporter(null);
    try {
      const source = await resolveMilestoneIllustrationSource(asset, createTaroMilestoneIllustrationTransport());
      setIllustrationState({ kind: "ready", source });
    } catch {
      setIllustrationState({ kind: "error", source: null });
    }
  }, []);

  useEffect(() => {
    if (!poster) {
      setIllustrationState({ kind: "idle", source: null });
      return;
    }
    void resolveIllustration(poster);
  }, [illustrationKey, poster, resolveIllustration]);

  const resolvedPoster = poster && illustrationState.kind === "ready"
    ? { ...poster, illustration: illustrationState.source }
    : null;

  const exportImage = useCallback(async () => {
    if (!exporter) throw new Error(t("milestonePoster.generating"));
    return exporter();
  }, [exporter, t]);

  const closeSharePreview = useCallback(() => {
    setSharePreviewOpen(false);
    setSharePreviewPath(null);
  }, []);

  const share = useCallback(async (providedPath?: string) => {
    if (state.kind !== "ready") return;
    try {
      const path = providedPath ?? await exportImage();
      if (typeof Taro.showShareImageMenu !== "function") throw new Error(t("milestonePoster.unsupportedShare"));
      await Taro.showShareImageMenu({ path });
      if (!isDemo) await recordMilestoneShare(state.eventId);
      closeSharePreview();
    } catch (reason) {
      Taro.showToast({ title: getErrorMessage(reason, (key) => String(t(key))), icon: "none" });
    }
  }, [closeSharePreview, exportImage, isDemo, state, t]);

  const saveToAlbum = useCallback(async (providedPath?: string) => {
    try {
      const path = providedPath ?? await exportImage();
      await Taro.saveImageToPhotosAlbum({ filePath: path });
      Taro.showToast({ title: t("milestonePoster.savedToAlbum"), icon: "success" });
      closeSharePreview();
    } catch (reason) {
      Taro.showToast({ title: getErrorMessage(reason, (key) => String(t(key))), icon: "none" });
    }
  }, [closeSharePreview, exportImage, t]);

  const openSharePreview = useCallback(async () => {
    if (sharePreviewBusy || sharePreviewOpen) return;
    setSharePreviewBusy(true);
    try {
      const path = await exportImage();
      setSharePreviewPath(path);
      setSharePreviewOpen(true);
    } catch (reason) {
      Taro.showToast({ title: getErrorMessage(reason, (key) => String(t(key))), icon: "none" });
    } finally {
      setSharePreviewBusy(false);
    }
  }, [exportImage, sharePreviewBusy, sharePreviewOpen, t]);

  return (
    <PageLayout title={t("milestonePoster.pageTitle")} showTabs={false} hideNavigation showBack disablePageEnterAnimation onTopBarBack={() => navigateBackOrHome("/pages/milestone-journey/index")} scrollLocked={galleryOpen} className="page-layout--milestone-poster">
      <View className="milestone-poster-page">
        {isDemo ? <Text className="milestone-poster-page__demo">{t("milestonePoster.demoNote")}</Text> : null}
        {state.kind === "loading" ? <View className="milestone-poster-page__snapshot-shell" ariaLabel={t("milestonePoster.loadingPage")} /> : null}
        {state.kind === "error" ? (
          <View className="milestone-poster-page__error">
            <Text>{state.message}</Text>
            <Text onClick={() => void load()}>{t("milestonePoster.retry")}</Text>
          </View>
        ) : null}
        {poster ? (
          <>
            <MilestonePoster
              {...poster}
              illustration={illustrationState.source ?? undefined}
              illustrationStatus={illustrationState.kind === "idle" ? "loading" : illustrationState.kind}
              onIllustrationRetry={() => void resolveIllustration(poster)}
              onShare={() => void openSharePreview()}
              onViewIllustrations={poster.illustrationAsset ? () => setGalleryOpen(true) : undefined}
              onContinue={() => Taro.switchTab({ url: "/pages/home/index" })}
            />
            {resolvedPoster ? <MilestonePosterCanvas poster={resolvedPoster} onReady={handleExporterReady} /> : null}
          </>
        ) : null}
      </View>
      {sharePreviewOpen && sharePreviewPath ? (
        <MilestoneSharePreview
          path={sharePreviewPath}
          busy={sharePreviewBusy}
          topOffset={layout.totalHeaderHeight}
          onClose={closeSharePreview}
          onShare={() => void share(sharePreviewPath)}
          onSave={() => void saveToAlbum(sharePreviewPath)}
        />
      ) : null}
      {poster?.illustrationAsset ? (
        <MilestoneStageGallery
          open={galleryOpen}
          milestone={poster.milestone}
          frozenAsset={poster.illustrationAsset}
          onClose={() => setGalleryOpen(false)}
        />
      ) : null}
    </PageLayout>
  );
}
