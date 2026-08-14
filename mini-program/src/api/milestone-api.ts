import { requestProductApi } from "./product-api-client";
import type { Milestone } from "../features/milestones/stats";
import type { MilestoneSnapshot } from "../features/milestones/snapshot";

export type ProductMilestoneEventStatus = "pending" | "presented" | "invalidated";

export interface ProductMilestoneEvent {
  id: string;
  cycle_id: string;
  milestone: Milestone;
  status: ProductMilestoneEventStatus;
  presentation_snapshot: MilestoneSnapshot | null;
  presentation_claim_token?: string | null;
  presentation_claimed_at?: string | null;
  shown_at?: string | null;
  shared_at?: string | null;
}

export interface ProductMilestoneCycle {
  id: string;
  start_date: string;
  end_date?: string | null;
  status: "active" | "ended";
}

export interface ProductMilestoneJourney {
  currentStreakDays: number;
  highestMilestone: Milestone | null;
  cycles: ProductMilestoneCycle[];
  events: ProductMilestoneEvent[];
}

export async function claimPendingMilestone() {
  const result = await requestProductApi<{ event: ProductMilestoneEvent | null }>("/milestones/claim-pending", {
    method: "POST",
    data: {},
    fallbackMessage: "里程碑暂时不可用，请稍后再试",
  });
  return result.event;
}

export async function confirmMilestonePresentation(eventId: string, claimToken: string) {
  const result = await requestProductApi<{ snapshot: MilestoneSnapshot }>(
    `/milestones/${encodeURIComponent(eventId)}/present`,
    {
      method: "POST",
      data: { claimToken },
      fallbackMessage: "里程碑确认失败，请稍后重试",
    },
  );
  return result.snapshot;
}

export async function getPresentedMilestoneEvent(eventId: string) {
  return requestProductApi<ProductMilestoneEvent>(`/milestone-events/${encodeURIComponent(eventId)}`, {
    method: "GET",
    fallbackMessage: "里程碑海报读取失败，请稍后重试",
  });
}

export async function getMilestoneJourney() {
  return requestProductApi<ProductMilestoneJourney>("/milestone-journey/current", {
    method: "GET",
    fallbackMessage: "我的旅程读取失败，请稍后重试",
  });
}

export async function recordMilestoneShare(eventId: string) {
  await requestProductApi(`/milestones/${encodeURIComponent(eventId)}/share`, {
    method: "POST",
    data: {},
    fallbackMessage: "分享记录失败，请稍后重试",
  });
}
