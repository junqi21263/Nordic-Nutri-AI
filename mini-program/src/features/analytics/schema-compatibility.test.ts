import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createAnalyticsCollector, type CollectionGrant } from './collector';
const require = createRequire(import.meta.url);
const { validateEvent } = require('../../../../cloudbase/functions/get-login-ticket/analytics-schema.cjs') as { validateEvent: (value: unknown, now: Date) => { event?: unknown; reason?: string } };
it('actual client event fields are accepted by the deployed backend contract', () => {
  const now = new Date('2026-10-21T01:00:00Z');
  const grant: CollectionGrant = { consent_revision: randomUUID(), collection_token: 'proof', expires_at: '2030-01-01T00:00:00Z', analytics: true, diagnostics: true };
  const collector = createAnalyticsCollector({ now: () => now.getTime(), uuid: randomUUID, send: async () => ({ status: 200, results: [] }), persist: async () => undefined, schedule: () => undefined, cancel: () => undefined });
  collector.setGrant(grant);
  const observations: Array<[string, Record<string, string | number | string[]>]> = [
    ['screen_view', {}], ['screen_engagement', { duration_ms: 1000 }], ['first_observed_open', { observation_origin: 'unknown' }],
    ['app_foreground', { entry_kind: 'foreground' }], ['session_start', { entry_kind: 'foreground' }],
    ['auth_started', { method: 'google', entry: 'login' }], ['google_credential_result', { outcome: 'failed', stage: 'native_callback', error_type: 'unknown' }],
    ['scan_opened', { entry: 'scanner' }], ['image_upload_result', { entry: 'camera', outcome: 'failed', error_code: 'network_failed', duration_ms: 1000 }],
    ['vision_result_viewed', {}], ['vision_result_edited', { edited_fields: ['ingredients', 'meal_type'] }], ['meal_save_clicked', { entry: 'scan' }],
    ['nova_request_started', { entry: 'coach' }], ['nova_first_chunk', { first_chunk_ms: 10 }], ['nova_display_terminal', { outcome: 'completed', reason: 'protocol_complete', duration_ms: 1000, received_chunk_count: 10 }],
    ['notification_permission_result', { status: 'granted' }], ['feedback_reply_viewed', {}], ['account_binding_result', { method: 'email', outcome: 'succeeded' }],
    ['version_observed', { target_version: '1.1.30' }], ['update_checked', { target_version: '1.1.31' }], ['update_clicked', { target_version: '1.1.31' }],
    ['client_error', { error_fingerprint: 'app:TypeError', module: 'app', error_type: 'TypeError', severity: 'error' }], ['native_diagnostic', { stage: 'previous_process', error_type: 'anr' }],
  ];
  for (const [name, properties] of observations) collector.track(name, properties, { page_key: 'home', operation_id: randomUUID(), attempt_id: randomUUID() });
  expect(collector.snapshot().events).toHaveLength(observations.length);
  for (const event of collector.snapshot().events) expect(validateEvent(event, now).reason, event.event_name).toBeUndefined();
});
