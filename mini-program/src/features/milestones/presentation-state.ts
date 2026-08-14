import { getMilestoneIllustration } from "./config";
import { milestonePosterFixtures } from "./fixture";
import type { MilestonePresentation } from "./get-milestone-stats";
import type { Milestone } from "./stats";

const presentationCache = new Map<Milestone, MilestonePresentation>();

export type InitialMilestonePresentation = {
  pending: boolean;
  value: MilestonePresentation;
};

function createStablePosterShell(milestone: Milestone): MilestonePresentation {
  return {
    milestone,
    mealsLogged: 0,
    recordedDays: 0,
    personalizedMessage: "正在整理你这段时间的饮食记录。",
    illustration: getMilestoneIllustration(milestone),
  };
}

export function createInitialMilestonePresentation({
  milestone,
  isDemo,
}: {
  milestone: Milestone;
  isDemo: boolean;
}): InitialMilestonePresentation {
  if (isDemo) {
    return {
      pending: false,
      value: {
        ...milestonePosterFixtures[milestone],
        recordedDays: milestone,
        illustration: getMilestoneIllustration(milestone, milestone - 1),
      },
    };
  }

  const cached = presentationCache.get(milestone);
  return { pending: !cached, value: cached ?? createStablePosterShell(milestone) };
}

export function cacheMilestonePresentation(presentation: MilestonePresentation) {
  presentationCache.set(presentation.milestone, presentation);
}
