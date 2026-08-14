import type { Milestone } from "./stats";

// TARO_APP_ENV is an explicit release setting. NODE_ENV is "production" for
// a non-watch local build as well, so it cannot safely decide whether this
// developer-only entry should be visible.
export const isMilestonePreviewDevelopmentBuild = process.env.TARO_APP_ENV !== "production";

export function getMilestonePreviewUrl(milestone: Milestone) {
  return `/pages/milestone-poster/index?milestone=${milestone}&demo=1`;
}
