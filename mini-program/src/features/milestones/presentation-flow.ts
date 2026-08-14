import Taro from "@tarojs/taro";
import { claimPendingMilestone, type ProductMilestoneEvent } from "../../api/milestone-api";
import { getMilestonePosterUrl } from "./runtime";

export type MilestonePresentationTrigger = "normal_record_success" | "home_did_show";

type PendingNavigation = {
  event: ProductMilestoneEvent;
  claimToken: string;
  navigationStarted: boolean;
};

type MilestonePresentationDependencies = {
  claimPending: () => Promise<ProductMilestoneEvent | null>;
  navigate: (url: string) => Promise<unknown>;
  log?: (level: "info" | "warn", payload: Record<string, unknown>) => void;
};

function errorDetail(error: unknown) {
  const code = typeof error === "object" && error && "code" in error && typeof error.code === "string"
    ? { code: error.code }
    : {};
  if (error instanceof Error) return { name: error.name, message: error.message, ...code };
  return { message: String(error), ...code };
}

function defaultLog(level: "info" | "warn", payload: Record<string, unknown>) {
  const message = "[milestones] presentation";
  if (level === "warn") console.warn(message, payload);
  else console.info(message, payload);
}

/** Coordinates client triggers; the server's atomic claim remains authoritative. */
export function createMilestonePresentationCoordinator({ claimPending, navigate, log = defaultLog }: MilestonePresentationDependencies) {
  let inFlight: Promise<ProductMilestoneEvent | null> | null = null;
  let pendingNavigation: PendingNavigation | null = null;

  const navigateToClaimedPoster = async (trigger: MilestonePresentationTrigger, pending: PendingNavigation) => {
    const event = pending.event;
    try {
      await navigate(getMilestonePosterUrl({ eventId: event.id, claimToken: pending.claimToken }));
      pending.navigationStarted = true;
      log("info", { trigger, result: "poster_navigation_started", eventId: event.id });
      return event;
    } catch (error) {
      log("warn", { trigger, result: "poster_navigation_failed", eventId: event.id, ...errorDetail(error) });
      return null;
    }
  };

  const tryPresentPendingMilestone = (trigger: MilestonePresentationTrigger) => {
    if (inFlight) {
      log("info", { trigger, result: "joined_in_flight" });
      return inFlight;
    }
    if (pendingNavigation?.navigationStarted) {
      log("info", { trigger, result: "already_navigated", eventId: pendingNavigation.event.id });
      return Promise.resolve(null);
    }

    inFlight = (async () => {
      if (pendingNavigation) return navigateToClaimedPoster(trigger, pendingNavigation);
      let event: ProductMilestoneEvent | null;
      try {
        event = await claimPending();
      } catch (error) {
        log("warn", { trigger, result: "claim_failed", ...errorDetail(error) });
        return null;
      }
      if (!event) {
        log("info", { trigger, result: "no_pending_event" });
        return null;
      }
      if (!event.presentation_claim_token) {
        log("warn", { trigger, result: "claim_missing_token", eventId: event.id });
        return null;
      }
      pendingNavigation = { event, claimToken: event.presentation_claim_token, navigationStarted: false };
      return navigateToClaimedPoster(trigger, pendingNavigation);
    })();

    return inFlight.finally(() => { inFlight = null; });
  };

  return { tryPresentPendingMilestone };
}

const coordinator = createMilestonePresentationCoordinator({
  claimPending: claimPendingMilestone,
  navigate: (url) => Taro.navigateTo({ url }),
});

export const tryPresentPendingMilestone = coordinator.tryPresentPendingMilestone;
