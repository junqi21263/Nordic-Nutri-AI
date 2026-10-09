const { createRoutedOpenAiFetch } = require("./text-model-adapter-registry.cjs");

function reportAttempt(onAttempt, event) {
  if (typeof onAttempt !== "function") return;
  try { onAttempt(event); } catch { /* observability must never block a request */ }
}

function attemptEvent({ feature, route, attempt, phase, startedAt, error = null }) {
  return {
    feature,
    provider: route.providerKey,
    model: route.modelKey,
    attempt,
    phase,
    elapsedMs: Date.now() - startedAt,
    ...(error?.code ? { errorCode: error.code } : {}),
  };
}

function createRoutedModelInvoker({ feature, resolver, createService, fetchImpl = globalThis.fetch, beforeInvoke = null, onAttempt = null, getSignal = null } = {}) {
  if (!resolver || typeof resolver.resolveCandidates !== "function") throw new Error("Model route resolver is required");
  if (typeof createService !== "function") throw new Error("Routed service factory is required");
  return async (...args) => {
    const signal = getSignal?.(...args);
    signal?.throwIfAborted();
    const candidates = await resolver.resolveCandidates({ feature });
    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      signal?.throwIfAborted();
      const route = candidates[index];
      const startedAt = Date.now();
      try {
        reportAttempt(onAttempt, attemptEvent({ feature, route, attempt: index, phase: "started", startedAt }));
        if (typeof beforeInvoke === "function") await beforeInvoke({ feature, route, attempt: index });
        signal?.throwIfAborted();
        const service = createService({
          apiKey: route.credential,
          model: route.modelKey,
          source: route.providerKey,
          routeManaged: true,
          fetchImpl: createRoutedOpenAiFetch(route, { fetchImpl }),
          route,
        });
        const result = await service(...args);
        reportAttempt(onAttempt, attemptEvent({ feature, route, attempt: index, phase: "succeeded", startedAt }));
        if (!result || typeof result !== "object" || Array.isArray(result)) return result;
        return {
          ...result,
          provider: result.provider || route.providerKey,
          model: result.model || route.modelKey,
          fallbackUsed: index > 0,
        };
      } catch (error) {
        lastError = error;
        reportAttempt(onAttempt, attemptEvent({ feature, route, attempt: index, phase: "failed", startedAt, error }));
      }
    }
    throw lastError || new Error("No routed model is available");
  };
}

function createRoutedModelStreamInvoker({ feature, resolver, createService, fetchImpl = globalThis.fetch, beforeInvoke = null, onAttempt = null } = {}) {
  if (!resolver || typeof resolver.resolveCandidates !== "function") throw new Error("Model route resolver is required");
  if (typeof createService !== "function") throw new Error("Routed service factory is required");
  return async function* routedModelStream(...args) {
    const candidates = await resolver.resolveCandidates({ feature });
    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const route = candidates[index];
      const startedAt = Date.now();
      let emittedContent = false;
      try {
        reportAttempt(onAttempt, attemptEvent({ feature, route, attempt: index, phase: "started", startedAt }));
        if (typeof beforeInvoke === "function") await beforeInvoke({ feature, route, attempt: index });
        const stream = createService({
          apiKey: route.credential,
          model: route.modelKey,
          source: route.providerKey,
          routeManaged: true,
          fetchImpl: createRoutedOpenAiFetch(route, { fetchImpl }),
          route,
        })(...args);
        for await (const event of stream) {
          if (event && typeof event === "object" && event.type === "usage") {
            yield { ...event, provider: event.provider || route.providerKey, model: event.model || route.modelKey };
          } else {
            if (typeof event === "string" && event) emittedContent = true;
            yield event;
          }
        }
        reportAttempt(onAttempt, attemptEvent({ feature, route, attempt: index, phase: "succeeded", startedAt }));
        yield {
          type: "route",
          provider: route.providerKey,
          model: route.modelKey,
          fallbackUsed: index > 0,
        };
        return;
      } catch (error) {
        lastError = error;
        reportAttempt(onAttempt, attemptEvent({ feature, route, attempt: index, phase: "failed", startedAt, error }));
        if (emittedContent) throw error;
      }
    }
    throw lastError || new Error("No routed model is available");
  };
}

module.exports = { createRoutedModelInvoker, createRoutedModelStreamInvoker };
