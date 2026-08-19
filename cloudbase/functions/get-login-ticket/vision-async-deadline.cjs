const { VISION_BUDGETS } = require("./vision-budget.cjs");

// The dispatcher is a durability fallback with a one-minute cadence.  The
// async deadline must therefore cover its worst-case wait before spending any
// time on worker startup or provider/enrichment work.
const ASYNC_DEADLINE_COMPONENTS = Object.freeze({
  dispatcherIntervalMs: 60_000,
  schedulerJitterMs: 5_000,
  workerStartupMs: 10_000,
  orchestrationOverheadMs: 1_000,
  providerAttemptMs: VISION_BUDGETS.flashMaxMs,
  enrichmentMs: VISION_BUDGETS.plusMaxMs
    + VISION_BUDGETS.nutritionReserveMs
    + VISION_BUDGETS.evaluationMaxMs
    + VISION_BUDGETS.persistenceReserveMs,
  graceMs: 15_000,
});

function toEpochMs(value, name) {
  const epoch = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(epoch)) throw new Error(`VISION_ASYNC_${name.toUpperCase()}_INVALID`);
  return epoch;
}

function createAsyncLifecycleDeadlines({ startedAt = Date.now(), now = Date.now, components = {} } = {}) {
  const startedMs = toEpochMs(startedAt, "started_at");
  const resolved = { ...ASYNC_DEADLINE_COMPONENTS, ...components };
  const asyncBudgetMs = Object.values(resolved).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
    - resolved.graceMs;
  const asyncDeadlineAt = startedMs + asyncBudgetMs;
  const reservationExpiresAt = asyncDeadlineAt + Math.max(0, Number(resolved.graceMs) || 0);
  const expiresAt = reservationExpiresAt;
  return {
    startedAt: new Date(startedMs),
    asyncBudgetMs,
    asyncDeadlineAt: new Date(asyncDeadlineAt),
    reservationExpiresAt: new Date(reservationExpiresAt),
    expiresAt: new Date(expiresAt),
    remainingAt: (at = now()) => Math.max(0, asyncDeadlineAt - toEpochMs(at, "clock")),
  };
}

module.exports = { ASYNC_DEADLINE_COMPONENTS, createAsyncLifecycleDeadlines };
