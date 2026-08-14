import type { ProductMilestoneEventStatus } from "../../api/milestone-api";
import {
  getMilestoneIllustrationAssetById,
  MILESTONE_ASSET_IDS,
} from "./config";
import type { MilestoneIllustrationAsset } from "./asset-cache";
import type { Milestone } from "./stats";

export type JourneyStageState = "presented" | "pending" | "next" | "locked";

export type JourneyStageConfig = {
  milestone: Milestone;
  /** Stable English key used only for code-level semantics. */
  theme: "START" | "RHYTHM" | "BALANCE" | "LIFESTYLE";
  /** User-facing Chinese copy for the Journey UI. */
  displayTitle: string;
  displaySeries: string;
  collectionCount: number;
  representativeId: string;
  journeyMessage: string;
};

export const JOURNEY_STAGE_CONFIG: Record<Milestone, JourneyStageConfig> = {
  3: {
    milestone: 3,
    theme: "START",
    displayTitle: "起步",
    displaySeries: "起步系列",
    collectionCount: 3,
    representativeId: "start-breakfast",
    journeyMessage: "第一段节奏已经建立，继续记录下一餐。",
  },
  7: {
    milestone: 7,
    theme: "RHYTHM",
    displayTitle: "节奏",
    displaySeries: "节奏系列",
    collectionCount: 3,
    representativeId: "rhythm-weekly-a",
    journeyMessage: "连续记录一周，让饮食记录慢慢形成自己的节奏。",
  },
  14: {
    milestone: 14,
    theme: "BALANCE",
    displayTitle: "平衡",
    displaySeries: "平衡系列",
    collectionCount: 2,
    representativeId: "balance-a",
    journeyMessage: "当记录逐渐稳定，你会解锁下一段 Journey。",
  },
  30: {
    milestone: 30,
    theme: "LIFESTYLE",
    displayTitle: "生活方式",
    displaySeries: "生活方式系列",
    collectionCount: 2,
    representativeId: "lifestyle-a",
    journeyMessage: "坚持记录到 30 天，把这一段饮食旅程留成属于你的月度海报。",
  },
};

export function getJourneyStageState({
  milestone,
  event,
  nextMilestone,
}: {
  milestone: Milestone;
  event: Pick<{ status: ProductMilestoneEventStatus }, "status"> | null;
  nextMilestone: Milestone | null;
}): JourneyStageState {
  if (event?.status === "presented") return "presented";
  if (event?.status === "pending") return "pending";
  return milestone === nextMilestone ? "next" : "locked";
}

export function getJourneyStageStatusLabel(state: JourneyStageState, currentDays: number, milestone: Milestone) {
  if (state === "presented") return "已解锁";
  if (state === "pending") return "已解锁 · 待展示";
  if (state === "next") return `还差 ${Math.max(milestone - currentDays, 0)} 天`;
  return "未解锁";
}

export function getRepresentativeJourneyCover(milestone: Milestone): MilestoneIllustrationAsset {
  const stage = JOURNEY_STAGE_CONFIG[milestone];
  return getMilestoneIllustrationAssetById(milestone, stage.representativeId);
}

export function getJourneyStageIllustrationSeries(milestone: Milestone): MilestoneIllustrationAsset[] {
  return MILESTONE_ASSET_IDS[milestone].map((id) => getMilestoneIllustrationAssetById(milestone, id));
}
