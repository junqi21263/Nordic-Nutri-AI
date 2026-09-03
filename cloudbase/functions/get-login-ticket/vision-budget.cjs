const VISION_BUDGETS = Object.freeze({
  serverTotalMs: 30_000,
  securityMaxMs: 2_000,
  uploadAttemptMaxMs: 2_500,
  flashMaxMs: 18_000,
  plusMaxMs: 3_000,
  nutritionReserveMs: 1_200,
  evaluationMaxMs: 2_500,
  evaluationReserveMs: 2_500,
  persistenceReserveMs: 1_800,
});

function createVisionBudget({ totalMs, startedAt, now = Date.now } = {}) {
  if (startedAt === undefined) startedAt = now();
  const duration = Math.max(0, Number(totalMs) || 0);
  const deadlineAt = startedAt + duration;
  const remainingMs = (at = now()) => Math.max(0, deadlineAt - at);
  const remainingAfterReserve = (requiredReserveMs = 0, at = now()) =>
    Math.max(0, remainingMs(at) - Math.max(0, Number(requiredReserveMs) || 0));
  const stageTimeout = (stageMaxMs, requiredReserveMs = 0, at = now()) =>
    Math.min(Math.max(0, Number(stageMaxMs) || 0), remainingAfterReserve(requiredReserveMs, at));
  return { startedAt, deadlineAt, remainingMs, remainingAfterReserve, stageTimeout };
}

module.exports = { createVisionBudget, VISION_BUDGETS };
