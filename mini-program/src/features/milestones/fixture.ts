import { getMilestoneIllustration } from "./config";
import type { MilestonePosterProps } from "../../components/milestone-poster";

/** Demo-only data for local visual inspection. Production pages must use getMilestoneStats. */
export const milestonePosterFixtures: Record<3 | 7 | 14 | 30, MilestonePosterProps> = {
  3: {
    milestone: 3,
    illustration: getMilestoneIllustration(3, 0),
    personalizedMessage: "你迈出了第一步，每天的小坚持正在积累改变。",
    mealsLogged: 9,
    recordingConsistency: 85,
  },
  7: {
    milestone: 7,
    illustration: getMilestoneIllustration(7, 1),
    personalizedMessage: "你找到了适合自己的节奏，饮食记录变得更规律。",
    mealsLogged: 21,
    targetCompletionRate: 90,
  },
  14: {
    milestone: 14,
    illustration: getMilestoneIllustration(14, 0),
    personalizedMessage: "你的饮食逐渐趋于平衡，身体正在稳步适应新的节奏。",
    mealsLogged: 39,
    avgProtein: 42,
    avgCarbs: 210,
    avgFat: 62,
  },
  30: {
    milestone: 30,
    illustration: getMilestoneIllustration(30, 1),
    personalizedMessage: "坚持已成为生活方式，健康选择正在自然发生。",
    mealsLogged: 84,
    targetDays: 27,
    targetCompletionRate: 93,
    vsPreviousPeriod: 18,
  },
};

export function getMilestoneFixture(milestone: 3 | 7 | 14 | 30) {
  return milestonePosterFixtures[milestone];
}
