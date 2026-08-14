import {
  getMilestoneIllustrationAsset,
  isMilestone,
  LEGACY_MILESTONE_ILLUSTRATION_VERSION,
} from "./config";
import type { MilestoneHighlight } from "./stats";
import type { MilestonePosterProps } from "../../components/milestone-poster";

export type MilestoneSnapshot = {
  cycleId: string;
  milestone: 3 | 7 | 14 | 30;
  milestoneIndex: string;
  personalizedMessage: string;
  illustrationId: string;
  illustrationVersion?: number | string;
  highlights: Array<{ type: MilestoneHighlight["key"]; label: string; value: string }>;
  progressState: Array<{ milestone: 3 | 7 | 14 | 30; active: boolean }>;
  [key: string]: unknown;
};

function normalizeIllustrationVersion(value: MilestoneSnapshot["illustrationVersion"]): string {
  if (typeof value === "number" && Number.isFinite(value)) return `v${value}`;
  if (typeof value === "string" && value.trim()) {
    const version = value.trim();
    return version.startsWith("v") ? version : `v${version}`;
  }
  return LEGACY_MILESTONE_ILLUSTRATION_VERSION;
}

export function toMilestonePosterPresentation(snapshot: MilestoneSnapshot): MilestonePosterProps & { progressState: MilestoneSnapshot["progressState"] } {
  const milestone = snapshot.milestone;
  if (!isMilestone(milestone)) throw new Error("里程碑快照无效");
  const variant = Number(snapshot.illustrationId.split("-").at(-1));
  const illustrationAsset = getMilestoneIllustrationAsset(
    milestone,
    Number.isFinite(variant) ? variant : 0,
    normalizeIllustrationVersion(snapshot.illustrationVersion),
  );
  const highlights = snapshot.highlights.map((item) => ({ key: item.type, label: item.label, value: item.value }));
  return {
    milestone,
    personalizedMessage: snapshot.personalizedMessage,
    illustration: illustrationAsset.remoteSource ?? illustrationAsset.localSource ?? "",
    illustrationAsset,
    mealsLogged: 0,
    frozenHighlights: highlights,
    progressState: snapshot.progressState,
  };
}
