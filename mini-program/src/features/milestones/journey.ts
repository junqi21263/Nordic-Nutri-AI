import type { ProductMilestoneEvent, ProductMilestoneJourney } from "../../api/milestone-api";
import { MILESTONES, type Milestone } from "./stats";

export function getCurrentJourneyCycle(journey: ProductMilestoneJourney) {
  return [...journey.cycles].sort((left, right) => right.start_date.localeCompare(left.start_date))[0] ?? null;
}

export function getCurrentJourneyEvents(journey: ProductMilestoneJourney) {
  const cycle = getCurrentJourneyCycle(journey);
  if (!cycle) return [] as ProductMilestoneEvent[];
  return journey.events.filter((event) => event.cycle_id === cycle.id);
}

/** A pending event has crossed its threshold; only its first presentation is outstanding. */
export function getCurrentJourneyMilestoneEvent(events: ProductMilestoneEvent[], milestone: Milestone) {
  return events.find((event) => event.milestone === milestone && event.status !== "invalidated") ?? null;
}

export function getNextMilestone(streakDays: number): Milestone | null {
  return MILESTONES.find((milestone) => milestone > streakDays) ?? null;
}

export function getHighestPresentedMilestone(events: ProductMilestoneEvent[]): ProductMilestoneEvent | null {
  const presented = events.filter((event) => event.status === "presented");
  return [...presented].sort((left, right) => right.milestone - left.milestone)[0] ?? null;
}
