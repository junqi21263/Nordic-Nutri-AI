import { describe, expect, it, vi } from "vitest";

vi.mock("@tarojs/taro", () => ({ default: { navigateTo: vi.fn() } }));

import { createMilestonePresentationCoordinator } from "./presentation-flow";

const claimedEvent = {
  id: "event-3",
  cycle_id: "cycle-1",
  milestone: 3 as const,
  status: "pending" as const,
  presentation_snapshot: null,
  presentation_claim_token: "claim-token",
};

describe("milestone presentation coordinator", () => {
  it("leaves the completed meal flow unchanged when no pending event exists", async () => {
    const claimPending = vi.fn(async () => null);
    const navigate = vi.fn(async () => undefined);
    const coordinator = createMilestonePresentationCoordinator({ claimPending, navigate });

    await expect(coordinator.tryPresentPendingMilestone("normal_record_success")).resolves.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not turn a claim failure into a navigation or an unhandled error", async () => {
    const claimPending = vi.fn(async () => { throw Object.assign(new Error("network unavailable"), { code: "NETWORK_ERROR" }); });
    const navigate = vi.fn(async () => undefined);
    const log = vi.fn();
    const coordinator = createMilestonePresentationCoordinator({ claimPending, navigate, log });

    await expect(coordinator.tryPresentPendingMilestone("normal_record_success")).resolves.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("warn", expect.objectContaining({
      trigger: "normal_record_success",
      result: "claim_failed",
      code: "NETWORK_ERROR",
    }));
  });

  it("deduplicates concurrent normal-save and Home triggers into one presentation", async () => {
    let resolveClaim!: (value: typeof claimedEvent) => void;
    const claimPending = vi.fn(() => new Promise<typeof claimedEvent>((resolve) => { resolveClaim = resolve; }));
    const navigate = vi.fn(async () => undefined);
    const coordinator = createMilestonePresentationCoordinator({ claimPending, navigate });

    const normalSave = coordinator.tryPresentPendingMilestone("normal_record_success");
    const home = coordinator.tryPresentPendingMilestone("home_did_show");
    resolveClaim(claimedEvent);

    await expect(Promise.all([normalSave, home])).resolves.toEqual([claimedEvent, claimedEvent]);
    expect(claimPending).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("retains a successful claim for a navigation retry without claiming twice", async () => {
    const claimPending = vi.fn(async () => claimedEvent);
    const navigate = vi.fn().mockRejectedValueOnce(new Error("navigate failed")).mockResolvedValueOnce(undefined);
    const coordinator = createMilestonePresentationCoordinator({ claimPending, navigate });

    await expect(coordinator.tryPresentPendingMilestone("normal_record_success")).resolves.toBeNull();
    await expect(coordinator.tryPresentPendingMilestone("home_did_show")).resolves.toEqual(claimedEvent);
    expect(claimPending).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
