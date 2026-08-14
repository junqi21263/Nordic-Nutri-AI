import { MILESTONES, type Milestone } from "./stats";
import type { MilestoneIllustrationAsset } from "./asset-cache";

const milestoneAssetCdn = (process.env.TARO_APP_MILESTONE_ASSET_CDN || "").replace(/\/$/, "");
const isProductionRuntime = process.env.TARO_APP_ENV === "production";
export const LEGACY_MILESTONE_ILLUSTRATION_VERSION = "v1";
function getDevelopmentLocalMilestoneSource(id: string) {
  return ["", "assets", "images", "milestones", `${id}.jpg`].join("/");
}

export interface MilestoneConfig {
  index: "01" | "02" | "03" | "04";
  theme: "START" | "RHYTHM" | "BALANCE" | "LIFESTYLE";
  stageLabel: "起步阶段" | "建立节奏" | "营养平衡" | "稳定习惯";
  stageNumber: "第 1 阶段" | "第 2 阶段" | "第 3 阶段" | "第 4 阶段";
  eyebrow: "连续记录 · 起步" | "连续记录 · 节奏" | "连续记录 · 平衡" | "连续记录 · 习惯";
  illustrations: readonly string[];
}

export const MILESTONE_CONFIG: Record<Milestone, MilestoneConfig> = {
  3: { index: "01", theme: "START", stageLabel: "起步阶段", stageNumber: "第 1 阶段", eyebrow: "连续记录 · 起步", illustrations: isProductionRuntime ? [] : ["start-wellness", "start-breakfast", "start-garden"].map(getDevelopmentLocalMilestoneSource) },
  7: { index: "02", theme: "RHYTHM", stageLabel: "建立节奏", stageNumber: "第 2 阶段", eyebrow: "连续记录 · 节奏", illustrations: isProductionRuntime ? [] : ["rhythm-breakfast", "rhythm-weekly-a", "rhythm-weekly-b"].map(getDevelopmentLocalMilestoneSource) },
  14: { index: "03", theme: "BALANCE", stageLabel: "营养平衡", stageNumber: "第 3 阶段", eyebrow: "连续记录 · 平衡", illustrations: isProductionRuntime ? [] : ["balance-a", "balance-b"].map(getDevelopmentLocalMilestoneSource) },
  30: { index: "04", theme: "LIFESTYLE", stageLabel: "稳定习惯", stageNumber: "第 4 阶段", eyebrow: "连续记录 · 习惯", illustrations: isProductionRuntime ? [] : ["lifestyle-a", "lifestyle-b"].map(getDevelopmentLocalMilestoneSource) },
};

export const MILESTONE_ASSET_IDS: Record<Milestone, readonly string[]> = {
  3: ["start-wellness", "start-breakfast", "start-garden"],
  7: ["rhythm-breakfast", "rhythm-weekly-a", "rhythm-weekly-b"],
  14: ["balance-a", "balance-b"],
  30: ["lifestyle-a", "lifestyle-b"],
};


/** Stable asset identity for future CDN migration and cache invalidation. */
export function getMilestoneIllustrationAsset(
  milestone: Milestone,
  variant = 0,
  version = LEGACY_MILESTONE_ILLUSTRATION_VERSION,
): MilestoneIllustrationAsset {
  const index = Math.abs(variant) % MILESTONE_ASSET_IDS[milestone].length;
  return {
    id: MILESTONE_ASSET_IDS[milestone][index]!,
    // This source table is not created in production, so its paths cannot be
    // emitted into the release bundle while development remains offline-ready.
    localSource: MILESTONE_CONFIG[milestone].illustrations[index],
    remoteSource: milestoneAssetCdn
      ? `${milestoneAssetCdn}/milestones/${MILESTONE_ASSET_IDS[milestone][index]!}.jpg`
      : undefined,
    version,
  };
}

/** Resolve an exact server-selected illustration identity without deriving a variant. */
export function getMilestoneIllustrationAssetById(
  milestone: Milestone,
  id: string,
  version = LEGACY_MILESTONE_ILLUSTRATION_VERSION,
): MilestoneIllustrationAsset {
  const variant = MILESTONE_ASSET_IDS[milestone].indexOf(id);
  if (variant < 0) return getMilestoneIllustrationAsset(milestone, 0, version);
  return getMilestoneIllustrationAsset(milestone, variant, version);
}

/** The server supplies a stable index for each user + milestone period. */
export function getMilestoneIllustration(milestone: Milestone, variant = 0): string {
  const asset = getMilestoneIllustrationAsset(milestone, variant);
  return asset.remoteSource ?? asset.localSource ?? "";
}

export function isMilestone(value: number): value is Milestone {
  return MILESTONES.includes(value as Milestone);
}
