export type AnalyticsValue = string | number | boolean | string[];
export interface AnalyticsEvent {
  event_id: string; event_name: string; schema_version: 1; occurred_at: string;
  session_id: string; anonymous_id: string; consent_revision: string;
  platform: 'android'; app_version: string; build_code?: number; page_key: string;
  operation_id?: string; attempt_id?: string; trace_id?: string;
  properties: Record<string, AnalyticsValue>;
}
export interface CollectionGrant {
  consent_revision: string; collection_token: string; expires_at: string;
  analytics: boolean; diagnostics: boolean;
}
export interface AnalyticsSnapshot {
  owner: string; anonymous_id: string; session_id: string; grant: CollectionGrant | null;
  events: AnalyticsEvent[];
}
interface BatchResult { event_id: string; status: 'accepted' | 'duplicate' | 'rejected'; reason?: string }
interface CollectorOptions {
  now: () => number; uuid: () => string;
  send: (token: string, events: AnalyticsEvent[]) => Promise<{ status: number; results: BatchResult[]; retryAfterMs?: number }>;
  persist: (state: AnalyticsSnapshot) => Promise<void>;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
  random?: () => number;
}
const EVENT_FIELDS: Record<string, string[]> = {
  first_observed_open: ['observation_origin'], app_foreground: ['entry_kind'], session_start: ['entry_kind'],
  screen_view: [], screen_engagement: ['duration_ms'],
  auth_started: ['method', 'entry'], google_credential_result: ['outcome', 'error_type', 'stage'],
  scan_opened: ['entry'], image_upload_result: ['entry', 'outcome', 'error_code', 'duration_ms'],
  vision_result_viewed: [], vision_result_edited: ['edited_fields'], meal_save_clicked: ['entry'],
  nova_request_started: ['entry'], nova_first_chunk: ['first_chunk_ms'],
  nova_display_terminal: ['outcome', 'reason', 'duration_ms', 'received_chunk_count'],
  notification_permission_result: ['status'],
  feedback_reply_viewed: [], account_binding_result: ['method', 'outcome', 'error_code'],
  update_checked: ['from_version', 'target_version'], update_clicked: ['from_version', 'target_version'],
  version_observed: ['from_version', 'target_version'],
  client_error: ['error_fingerprint', 'module', 'error_type', 'severity'],
  native_diagnostic: ['error_fingerprint', 'stage', 'error_type'],
};
const diagnostic = (name: string) => name === 'client_error' || name === 'native_diagnostic' || name === 'google_credential_result';
const TTL = 72 * 3600_000;
const safeText = (value: unknown, limit = 80) => typeof value === 'string' && value.length <= limit && /^[a-zA-Z0-9_./:-]*$/.test(value);
function validProperties(name: string, values: Record<string, AnalyticsValue>) {
  const allowed = EVENT_FIELDS[name];
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
  if (!allowed || Object.keys(values).some(key => !allowed.includes(key))) return false;
  return Object.values(values).every(value => typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400_000)
    || safeText(value)
    || (Array.isArray(value) && value.length <= 10 && value.every(item => safeText(item, 40))));
}
function validGrant(value: unknown): value is CollectionGrant {
  if (!value || typeof value !== 'object') return false;
  const grant = value as Partial<CollectionGrant>;
  return typeof grant.analytics === 'boolean' && typeof grant.diagnostics === 'boolean'
    && typeof grant.collection_token === 'string' && grant.collection_token.length > 0 && grant.collection_token.length <= 8192
    && typeof grant.consent_revision === 'string' && grant.consent_revision.length <= 128
    && typeof grant.expires_at === 'string' && Number.isFinite(Date.parse(grant.expires_at));
}
const byteSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export function createAnalyticsCollector(options: CollectorOptions) {
  let owner = '', anonymousId = '', sessionId = '', grant: CollectionGrant | null = null;
  let queue: AnalyticsEvent[] = [], queueBytes = 0;
  let timer: unknown, persistTimer: unknown;
  let foreground = false, inFlight = false, blocked = false, generation = 0;
  let pauses = 0, attempts = 0, nextAttempt = 0, backgroundAt = options.now();
  let appVersion = 'unknown', buildCode: number | undefined;
  const active = () => grant !== null && (grant.analytics || grant.diagnostics) && Date.parse(grant.expires_at) > options.now();
  const snapshot = (): AnalyticsSnapshot => ({ owner, anonymous_id: anonymousId, session_id: sessionId, grant, events: queue.slice() });
  const stopTimer = () => { if (timer !== undefined) options.cancel(timer); timer = undefined; };
  const persist = () => {
    if (persistTimer !== undefined) return;
    persistTimer = options.schedule(() => {
      persistTimer = undefined;
      void options.persist(snapshot()).catch(() => undefined);
    }, 500);
  };
  const prune = () => {
    queue = queue.filter(event => options.now() - Date.parse(event.occurred_at) <= TTL);
    queueBytes = queue.reduce((sum, event) => sum + byteSize(event), 0);
  };
  const arm = (delay = 15_000) => {
    if (timer !== undefined || !queue.length || !foreground || pauses || blocked || !active() || attempts >= 5) return;
    timer = options.schedule(() => { timer = undefined; void flush(); }, Math.max(delay, nextAttempt - options.now()));
  };
  function revoke() {
    generation++; grant = null; anonymousId = ''; sessionId = ''; queue = []; queueBytes = 0;
    attempts = 0; blocked = false; nextAttempt = 0; stopTimer(); persist();
  }
  async function flush() {
    stopTimer(); prune();
    if (!active() || !foreground || pauses || inFlight || blocked || attempts >= 5 || nextAttempt > options.now() || !queue.length) { arm(); return; }
    const currentGeneration = generation;
    const batch: AnalyticsEvent[] = []; let bytes = 128;
    for (const event of queue) {
      const size = byteSize(event) + 1;
      if (batch.length >= 50 || bytes + size > 50 * 1024) break;
      batch.push(event); bytes += size;
    }
    if (!batch.length || !grant) return;
    inFlight = true; attempts++;
    try {
      const response = await options.send(grant.collection_token, batch);
      if (currentGeneration !== generation) return;
      if (response.status === 401 || response.status === 403) { blocked = true; return; }
      if (response.status === 410) { revoke(); return; }
      if (response.status >= 200 && response.status < 300) {
        const sentIds = new Set(batch.map(event => event.event_id));
        const settled = new Set(response.results.filter(result => sentIds.has(result.event_id) && ['accepted', 'duplicate', 'rejected'].includes(result.status)).map(result => result.event_id));
        queue = queue.filter(event => !settled.has(event.event_id)); prune();
        if (settled.size === batch.length) { attempts = 0; nextAttempt = 0; }
        else nextAttempt = options.now() + 15_000;
      } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        const ids = new Set(batch.map(event => event.event_id)); queue = queue.filter(event => !ids.has(event.event_id)); prune();
      } else {
        nextAttempt = options.now() + Math.max(response.retryAfterMs ?? 0, Math.min(300_000, 1000 * 2 ** attempts) * (0.75 + (options.random?.() ?? Math.random()) / 2));
      }
    } catch {
      if (currentGeneration === generation) nextAttempt = options.now() + Math.min(300_000, 1000 * 2 ** attempts) * (0.75 + (options.random?.() ?? Math.random()) / 2);
    } finally {
      inFlight = false; persist(); arm();
    }
  }
  return {
    snapshot, flush, revoke,
    setOwner(value: string) { if (value !== owner) { revoke(); owner = value; persist(); } },
    setVersion(version: string, code: number) { if (safeText(version)) appVersion = version; if (Number.isSafeInteger(code)) buildCode = code; },
    setGrant(value: CollectionGrant, id?: string) {
      if (!validGrant(value)) { revoke(); return; }
      generation++; grant = value; blocked = false; attempts = 0;
      if (!active()) { revoke(); return; }
      anonymousId = id || anonymousId || options.uuid(); sessionId ||= options.uuid();
      queue = queue.filter(event => event.consent_revision === value.consent_revision && (diagnostic(event.event_name) ? value.diagnostics : value.analytics));
      prune(); persist(); arm();
    },
    setForeground(value: boolean) {
      if (value && !foreground) {
        attempts = 0;
        if (active() && options.now() - backgroundAt >= 30 * 60_000) sessionId = options.uuid();
      }
      foreground = value;
      if (!value) { backgroundAt = options.now(); stopTimer(); persist(); } else arm();
    },
    pause() { pauses++; stopTimer(); let released = false; return () => { if (!released) { released = true; pauses = Math.max(0, pauses - 1); arm(); } }; },
    track(name: string, properties: Record<string, AnalyticsValue> = {}, context: { page_key?: string; operation_id?: string; attempt_id?: string; trace_id?: string } = {}) {
      try {
        if (!active() || !grant || !(diagnostic(name) ? grant.diagnostics : grant.analytics) || !validProperties(name, properties)) return;
        const page = context.page_key ?? (typeof properties.page_key === 'string' ? properties.page_key : 'unknown');
        if (!safeText(page)) return;
        for (const value of [context.operation_id, context.attempt_id, context.trace_id]) if (value !== undefined && !safeText(value, 128)) return;
        const event: AnalyticsEvent = { event_id: options.uuid(), event_name: name, schema_version: 1, occurred_at: new Date(options.now()).toISOString(), session_id: sessionId, anonymous_id: anonymousId, consent_revision: grant.consent_revision, platform: 'android', app_version: appVersion, ...(buildCode !== undefined ? { build_code: buildCode } : {}), ...context, page_key: page, properties: { ...properties } };
        if (byteSize(properties) > 1024) return;
        const bytes = byteSize(event); queue.push(event); queueBytes += bytes;
        while (queue.length > 1000 || queueBytes > 2 * 1024 * 1024) queueBytes -= byteSize(queue.shift());
        persist(); if (queue.length >= 20) stopTimer(); arm(queue.length >= 20 ? 0 : 15_000);
      } catch { /* Optional observation must never change a business result. */ }
    },
    restore(value: unknown) {
      if (!value || typeof value !== 'object') return;
      const stored = value as Partial<AnalyticsSnapshot>;
      if (stored.owner !== owner || !validGrant(stored.grant) || typeof stored.anonymous_id !== 'string' || typeof stored.session_id !== 'string') return;
      if (Date.parse(stored.grant.expires_at) <= options.now()) return;
      grant = stored.grant; anonymousId = stored.anonymous_id; sessionId = stored.session_id;
      queue = (Array.isArray(stored.events) ? stored.events : []).filter(event => event && typeof event.event_id === 'string' && event.platform === 'android' && safeText(event.page_key) && safeText(event.app_version, 32) && event.anonymous_id === anonymousId && event.consent_revision === grant?.consent_revision && validProperties(event.event_name, event.properties) && (diagnostic(event.event_name) ? grant?.diagnostics : grant?.analytics)).slice(-1000).map(event => ({ event_id: event.event_id, event_name: event.event_name, schema_version: 1, occurred_at: event.occurred_at, session_id: event.session_id, anonymous_id: event.anonymous_id, consent_revision: event.consent_revision, platform: 'android', app_version: event.app_version, page_key: event.page_key, ...(Number.isSafeInteger(event.build_code) ? { build_code: event.build_code } : {}), ...(safeText(event.operation_id, 128) ? { operation_id: event.operation_id } : {}), ...(safeText(event.attempt_id, 128) ? { attempt_id: event.attempt_id } : {}), ...(safeText(event.trace_id, 128) ? { trace_id: event.trace_id } : {}), properties: { ...event.properties } }));
      prune(); persist(); arm();
    },
  };
}
export type AnalyticsCollector = ReturnType<typeof createAnalyticsCollector>;
