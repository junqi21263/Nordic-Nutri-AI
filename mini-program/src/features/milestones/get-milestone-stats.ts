import { getProductMilestoneStats } from "../../api/insight-api";
import { getMilestoneIllustration } from "./config";
import { getLocalDateString } from "../onboarding/domain";
import type { Milestone, MilestoneStats } from "./stats";

export interface MilestonePresentation extends MilestoneStats {
  userName?: string;
  personalizedMessage: string;
  illustration?: string;
}

/**
 * The only production milestone data entry. The backend calculates from the
 * current CloudBase session and durable meal records; the UI never accepts a
 * user id or fixture data.
 */
export async function getMilestoneStats(
  milestone: Milestone,
  today = getLocalDateString(),
): Promise<MilestonePresentation> {
  const stats = await getProductMilestoneStats(milestone, today);
  return { ...stats, illustration: getMilestoneIllustration(milestone, stats.illustrationVariant) };
}
