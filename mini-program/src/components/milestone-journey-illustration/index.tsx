import { Image, Text, View } from "@tarojs/components";
import { useCallback, useEffect, useState } from "react";
import type { MilestoneIllustrationAsset } from "../../features/milestones/asset-cache";
import { resolveMilestoneIllustrationSource } from "../../features/milestones/asset-cache";
import { createTaroMilestoneIllustrationTransport } from "../../features/milestones/taro-asset-transport";

type IllustrationState = "loading" | "ready" | "error";

export function MilestoneJourneyIllustration({
  asset,
  className = "",
  locked = false,
}: {
  asset: MilestoneIllustrationAsset;
  className?: string;
  locked?: boolean;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [state, setState] = useState<IllustrationState>("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      setSource(await resolveMilestoneIllustrationSource(asset, createTaroMilestoneIllustrationTransport()));
      setState("ready");
    } catch {
      setSource(null);
      setState("error");
    }
  }, [asset]);

  useEffect(() => { void load(); }, [load]);
  return (
    <View className={`milestone-journey-illustration ${locked ? "milestone-journey-illustration--locked" : ""} ${className}`}>
      {state === "ready" && source ? <Image src={source} mode="aspectFill" className="milestone-journey-illustration__image" /> : null}
      {state !== "ready" ? (
        <View className="milestone-journey-illustration__placeholder">
          <Text onClick={state === "error" ? () => void load() : undefined}>{state === "error" ? "图片加载失败，点击重试" : ""}</Text>
        </View>
      ) : null}
      {locked ? <View className="milestone-journey-illustration__ivory-overlay" /> : null}
    </View>
  );
}
