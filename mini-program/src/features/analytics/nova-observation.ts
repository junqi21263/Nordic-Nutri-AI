import type { AnalyticsValue } from './collector';
type Track = (name: string, properties: Record<string, AnalyticsValue>, context: { operation_id: string; attempt_id: string; page_key: string }) => void;
export function createNovaObservation(track: Track, operationId: string, now = Date.now) {
  const start = now(); let chunks = 0, terminal = false;
  const context = { operation_id: operationId, attempt_id: operationId, page_key: 'coach' };
  track('nova_request_started', { entry: 'coach' }, context);
  const finish = (outcome: string, reason: string) => {
    if (terminal) return; terminal = true;
    track('nova_display_terminal', { outcome, reason, duration_ms: Math.max(0, now() - start), received_chunk_count: chunks }, context);
  };
  return {
    delta() { chunks++; if (chunks === 1) track('nova_first_chunk', { first_chunk_ms: Math.max(0, now() - start) }, context); },
    completed() { finish('completed', 'protocol_complete'); },
    failed(error: unknown, cancellation?: 'navigation_cancelled' | 'background_cancelled') {
      if (cancellation) { finish(cancellation, cancellation); return; }
      const code = error instanceof Error ? error.name : '';
      const outcome = code === 'COACH_STREAM_ABORTED' ? 'user_cancelled'
        : /TIMEOUT|Timeout/.test(code) ? 'timeout'
          : code === 'COACH_STREAM_PROTOCOL_ERROR' || code === 'SyntaxError' ? 'protocol_error'
            : code === 'TypeError' || code === 'COACH_NETWORK_ERROR' ? 'network_failed'
              : /^(COACH_DAILY_LIMIT_REACHED|MODEL_PROVIDER_FAILED|COACH_PROVIDER_FAILED)$/.test(code) ? 'provider_failed' : 'unknown';
      finish(outcome, outcome);
    },
  };
}
