import type { Milestone } from "./stats";
import { getMilestoneShareMetrics, type MilestoneShareMetric } from "./share-presentation";
import type { MilestonePosterProps } from "../../components/milestone-poster";

type Translate = (key: string, options?: { count?: number }) => string;

export function getLocalizedMilestoneStage(
  milestone: Milestone,
  part: "label" | "number" | "eyebrow" | "message",
  translate: Translate,
) {
  return translate(`milestonePoster.stages.${milestone}.${part}`);
}

export function getLocalizedMilestoneMetrics(
  poster: MilestonePosterProps,
  translate: Translate,
): MilestoneShareMetric[] {
  return getMilestoneShareMetrics(poster).map((metric) => {
    const key = metric.icon === "utensils"
      ? "meals"
      : metric.icon === "calendar-days"
        ? "streak"
        : metric.icon === "goal-performance"
          ? "goal"
          : metric.icon;
    let value = metric.value;
    const count = /^(\d+)/.exec(value)?.[1];
    if (count && metric.icon === "utensils") value = translate("milestonePoster.metrics.mealValue", { count: Number(count) });
    else if (count && metric.icon === "calendar-days") value = translate("milestonePoster.metrics.dayValue", { count: Number(count) });
    else if (metric.icon === "utensils" && value.includes("—")) value = "—";
    return { ...metric, label: translate(`milestonePoster.metrics.${key}`), value };
  });
}
