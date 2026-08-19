import assert from "node:assert/strict";
import test from "node:test";

import {
  ASYNC_DEADLINE_COMPONENTS,
  createAsyncLifecycleDeadlines,
} from "./vision-async-deadline.cjs";

test("async deadline is derived from dispatcher, startup, provider, downstream, and grace budgets", () => {
  const startedAt = Date.parse("2026-08-18T08:00:00.000Z");
  const deadlines = createAsyncLifecycleDeadlines({ startedAt });

  assert.equal(deadlines.asyncDeadlineAt - startedAt, deadlines.asyncBudgetMs);
  const executionBudget = Object.entries(ASYNC_DEADLINE_COMPONENTS)
    .filter(([name]) => name !== "graceMs")
    .reduce((sum, [, value]) => sum + value, 0);
  assert.equal(deadlines.asyncBudgetMs, executionBudget);
  assert.equal(deadlines.asyncBudgetMs >= 90_000, true);
  assert.equal(deadlines.asyncBudgetMs <= 120_000, true);
});

test("async deadline leaves the dispatcher worst case plus worker execution budget", () => {
  const startedAt = Date.parse("2026-08-18T08:00:00.000Z");
  const deadlines = createAsyncLifecycleDeadlines({ startedAt });
  const dispatcherAndStartup = ASYNC_DEADLINE_COMPONENTS.dispatcherIntervalMs
    + ASYNC_DEADLINE_COMPONENTS.schedulerJitterMs
    + ASYNC_DEADLINE_COMPONENTS.workerStartupMs;

  assert.equal(deadlines.asyncDeadlineAt - startedAt > dispatcherAndStartup, true);
  assert.equal(deadlines.expiresAt > deadlines.asyncDeadlineAt, true);
  assert.equal(deadlines.reservationExpiresAt > deadlines.asyncDeadlineAt, true);
});

test("deadline calculation is deterministic and supports a delayed dispatcher claim", () => {
  const startedAt = Date.parse("2026-08-18T08:00:00.000Z");
  const deadlines = createAsyncLifecycleDeadlines({ startedAt });
  const delayedClaimAt = startedAt + 65_000;

  assert.equal(deadlines.asyncDeadlineAt > delayedClaimAt, true);
  assert.equal(deadlines.remainingAt(delayedClaimAt) > 0, true);
});
