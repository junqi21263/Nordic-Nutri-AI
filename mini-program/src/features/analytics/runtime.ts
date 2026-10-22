import { useAuthStore } from '../../auth/auth-store';
import { productApiEndpoint } from '../../api/product-api-config';
import { getNativeAppInfo } from '../app-update/native';
import { createAnalyticsCollector, type AnalyticsValue, type CollectionGrant } from './collector';
import { createAnalyticsPersistence } from './persistence';

interface Preference { analytics: boolean; diagnostics: boolean }
interface PendingChoice { anonymous_id: string; consent_revision?: string; collection_token?: string }
interface PendingRevocation extends PendingChoice { owner: string; expires_at: number }
interface StoredState { collector: unknown; preference: Preference; pending: boolean; choice?: PendingChoice; revocations?: PendingRevocation[]; observedId?: string; observedVersion?: string; diagnosticSince: number }
const enabledPlatform = process.env.TARO_APP_PLATFORM === 'android';
const initial: Preference = { analytics: false, diagnostics: false };
let preference = { ...initial }, pending = false, initialized = false, foreground = false, owner = '';
let diagnosticSince = Date.now(), foregroundTimer: ReturnType<typeof setTimeout> | undefined;
let syncRunning = false, syncGeneration = 0, choice: PendingChoice | undefined;
let revocations: PendingRevocation[] = [], observedId = '', observedVersion = '', currentVersion = '';
let foregroundSince = 0, foregroundRecorded = false, runtimePauses = 0, syncNeeded = false;
let consentValidationRelease: (() => void) | undefined;
let deferredState: StoredState | undefined;
const listeners = new Set<() => void>();
const persistence = createAnalyticsPersistence(`${process.env.TARO_APP_ENV ?? 'development'}:android`);
const notify = () => listeners.forEach(listener => listener());
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const data = new Uint8Array(16); globalThis.crypto.getRandomValues(data);
  data[6] = (data[6] & 15) | 64; data[8] = (data[8] & 63) | 128;
  const hex = [...data].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function request(path: string, data?: object) {
  const token = useAuthStore.getState().session?.accessToken;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${productApiEndpoint}${path}`, {
      method: data ? 'POST' : 'GET', signal: controller.signal, credentials: 'omit', cache: 'no-store',
      headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : !data && analyticsCollector.snapshot().grant?.collection_token ? { 'x-analytics-collection': analyticsCollector.snapshot().grant?.collection_token ?? '' } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } finally { clearTimeout(timeout); }
}
export const analyticsCollector = createAnalyticsCollector({
  now: Date.now, uuid,
  schedule: (callback, delay) => setTimeout(callback, delay), cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  persist: collector => persistence.write({ collector, preference, pending, choice, revocations, observedId, observedVersion, diagnosticSince } satisfies StoredState),
  send: async (token, events) => {
    const response = await request('/analytics/batch', { collection_token: token, events });
    const body = await response.json().catch(() => ({})) as { results?: Array<{ event_id: string; status: 'accepted' | 'duplicate' | 'rejected'; reason?: string }> };
    const retryHeader = response.headers.get('retry-after');
    const seconds = retryHeader ? Number(retryHeader) : 0;
    const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(retryHeader ?? '') - Date.now());
    return { status: response.status, results: Array.isArray(body.results) ? body.results : [], retryAfterMs };
  },
});
function persistPreference() { void persistence.write({ collector: analyticsCollector.snapshot(), preference, pending, choice, revocations, observedId, observedVersion, diagnosticSince }).catch(() => undefined); }
function syncOwner() {
  const next = useAuthStore.getState().user?.id ?? '';
  if (next === owner) return false;
  if (pending && choice?.collection_token) {
    revocations = revocations.filter(item => item.owner !== owner && item.expires_at > Date.now());
    revocations.push({ ...choice, owner, expires_at: Date.now() + 30 * 86400_000 });
    revocations = revocations.slice(-20);
  }
  owner = next; syncGeneration++; preference = { ...initial }; pending = false; choice = undefined;
  consentValidationRelease?.(); consentValidationRelease = undefined;
  analyticsCollector.setOwner(owner);
  if (deferredState && (deferredState.collector as { owner?: unknown })?.owner === owner) restoreState(deferredState);
  deferredState = undefined;
  if (foreground && analyticsCollector.snapshot().grant && !pending) consentValidationRelease = analyticsCollector.pause();
  notify(); persistPreference(); return true;
}
function restoreState(stored: StoredState) {
  preference = { analytics: stored.preference.analytics, diagnostics: stored.preference.diagnostics === true };
  observedId = typeof stored.observedId === 'string' ? stored.observedId : '';
  observedVersion = typeof stored.observedVersion === 'string' ? stored.observedVersion : '';
  pending = stored.pending === true; choice = stored.choice;
  diagnosticSince = Number(stored.diagnosticSince) || Date.now();
  analyticsCollector.restore(stored.collector); notify();
}
async function synchronize() {
  if (!enabledPlatform || !initialized || !foreground || syncRunning) return;
  if (runtimePauses) { syncNeeded = true; return; }
  syncNeeded = false;
  syncRunning = true; const generation = syncGeneration;
  try {
    revocations = revocations.filter(item => item.expires_at > Date.now());
    for (const item of revocations.filter(item => item.owner === owner)) {
      const result = await request('/analytics/consent', { anonymous_id: item.anonymous_id, collection_token: item.collection_token, consent_revision: item.consent_revision, platform: 'android', analytics: false, diagnostics: false });
      if (!result.ok || generation !== syncGeneration) return;
      revocations = revocations.filter(record => record !== item); persistPreference();
    }
    let id = choice?.anonymous_id || analyticsCollector.snapshot().anonymous_id;
    if (!pending) {
      // A server-side account choice does not enable analytics on a new installation.
      if (!id) return;
      const response = await request(`/analytics/consent?platform=android${id ? `&anonymous_id=${encodeURIComponent(id)}` : ''}`);
      if (!response.ok || generation !== syncGeneration) return;
      const value = await response.json() as Preference & Partial<CollectionGrant>;
      if (typeof value.analytics !== 'boolean' || typeof value.diagnostics !== 'boolean') return;
      preference = { analytics: value.analytics, diagnostics: value.diagnostics }; notify();
      if (!preference.analytics && !preference.diagnostics) { analyticsCollector.revoke(); consentValidationRelease?.(); consentValidationRelease = undefined; persistPreference(); return; }
      if (id && typeof value.collection_token === 'string' && typeof value.consent_revision === 'string' && typeof value.expires_at === 'string') {
        analyticsCollector.setGrant(value as CollectionGrant, id);
        consentValidationRelease?.(); consentValidationRelease = undefined;
        observeGrant();
        if (preference.diagnostics) readNativeDiagnostics();
        return;
      }
      return;
    }
    const previous = choice ?? analyticsCollector.snapshot().grant;
    if (preference.analytics || preference.diagnostics) id ||= uuid();
    if (!id && !preference.analytics && !preference.diagnostics) { pending = false; return; }
    const response = await request('/analytics/consent', { anonymous_id: id, platform: 'android', ...preference, ...(previous ? { consent_revision: previous.consent_revision, collection_token: previous.collection_token } : {}) });
    if (!response.ok || generation !== syncGeneration) return;
    const value = await response.json() as CollectionGrant;
    if ((preference.analytics || preference.diagnostics) && (typeof value.consent_revision !== 'string' || typeof value.collection_token !== 'string' || !Number.isFinite(Date.parse(value.expires_at)))) return;
    pending = false; choice = undefined;
    if (preference.analytics || preference.diagnostics) { analyticsCollector.setGrant(value, id); consentValidationRelease?.(); consentValidationRelease = undefined; observeGrant(); }
    else analyticsCollector.revoke();
    notify(); persistPreference();
    if (preference.diagnostics) readNativeDiagnostics();
  } catch { /* Analysis failures never enter the application's error or auth flows. */ }
  finally { syncRunning = false; if (generation !== syncGeneration) void synchronize(); }
}
export function getAnalyticsPreference() { return { ...preference }; }
export function subscribeAnalyticsPreference(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setAnalyticsPreference(next: Preference) {
  if (!enabledPlatform) return;
  const previous = analyticsCollector.snapshot();
  const enabled = next.analytics === true || next.diagnostics === true;
  if (!enabled && !previous.anonymous_id && !choice?.anonymous_id) return;
  try { choice = { anonymous_id: previous.anonymous_id || choice?.anonymous_id || uuid(), ...(previous.grant ? { consent_revision: previous.grant.consent_revision, collection_token: previous.grant.collection_token } : {}) }; }
  catch { return; }
  preference = { analytics: next.analytics === true, diagnostics: next.diagnostics === true };
  pending = true; syncGeneration++;
  diagnosticSince = Date.now();
  // Drop queued data locally before attempting any revocation request.
  analyticsCollector.revoke(); notify(); persistPreference(); void synchronize();
  consentValidationRelease?.(); consentValidationRelease = undefined;
}
export function trackAnalytics(name: string, properties: Record<string, AnalyticsValue> = {}, context?: { page_key?: string; operation_id?: string; attempt_id?: string; trace_id?: string }) {
  if (enabledPlatform) analyticsCollector.track(name, properties, context);
}
export function pauseAnalytics() {
  if (!enabledPlatform) return () => undefined;
  runtimePauses++; const release = analyticsCollector.pause(); let released = false;
  return () => { if (released) return; released = true; release(); runtimePauses = Math.max(0, runtimePauses - 1); if (!runtimePauses && syncNeeded) void synchronize(); };
}
function observeGrant() {
  const id = analyticsCollector.snapshot().anonymous_id;
  if (preference.analytics && id && id !== observedId) {
    observedId = id; trackAnalytics('first_observed_open', { observation_origin: 'unknown' });
  }
  if (preference.analytics && currentVersion && observedVersion !== `${id}:${currentVersion}`) {
    observedVersion = `${id}:${currentVersion}`;
    trackAnalytics('version_observed', { target_version: currentVersion });
  }
  observeForeground(); persistPreference();
}
function observeForeground() {
  if (!foreground || foregroundRecorded || !preference.analytics || !analyticsCollector.snapshot().grant) return;
  if (foregroundTimer) clearTimeout(foregroundTimer);
  const wait = Math.max(0, foregroundSince + 2000 - Date.now());
  foregroundTimer = setTimeout(() => {
    if (!foreground || foregroundRecorded) return;
    foregroundRecorded = true;
    trackAnalytics('app_foreground', { entry_kind: 'foreground' });
    const session = analyticsCollector.snapshot().session_id;
    if (session && session !== lastSession) { lastSession = session; trackAnalytics('session_start', { entry_kind: 'foreground' }); }
  }, wait);
}
export function setAnalyticsForeground(value: boolean) {
  if (!enabledPlatform) return;
  if (value && !foreground) { foregroundSince = Date.now(); foregroundRecorded = false; }
  if (value && !foreground && analyticsCollector.snapshot().grant && !pending && !consentValidationRelease) consentValidationRelease = analyticsCollector.pause();
  foreground = value; analyticsCollector.setForeground(value);
  if (foregroundTimer) clearTimeout(foregroundTimer);
  if (!value) return;
  void synchronize(); observeForeground();
}
let lastSession = '';
export async function initializeAnalytics() {
  if (!enabledPlatform || initialized) return;
  initialized = true; owner = useAuthStore.getState().user?.id ?? ''; analyticsCollector.setOwner(owner);
  const generation = syncGeneration;
  try {
    const stored = await persistence.read() as StoredState | undefined;
    revocations = Array.isArray(stored?.revocations) ? stored.revocations.filter(item => item && typeof item.owner === 'string' && typeof item.anonymous_id === 'string' && item.expires_at > Date.now()).slice(-20) : [];
    if (stored && generation === syncGeneration && stored.collector && typeof stored.preference?.analytics === 'boolean') {
      const queueOwner = (stored.collector as { owner?: unknown }).owner;
      if (queueOwner === owner) restoreState(stored);
      else if (useAuthStore.getState().status === 'unknown') deferredState = stored;
      if (foreground && analyticsCollector.snapshot().grant && !pending && !consentValidationRelease) consentValidationRelease = analyticsCollector.pause();
    }
    const previousOwner = stored?.collector && typeof stored.collector === 'object' ? (stored.collector as { owner?: unknown }).owner : undefined;
    if (typeof previousOwner === 'string' && previousOwner !== owner && stored?.pending && stored.choice?.collection_token) {
      revocations.push({ ...stored.choice, owner: previousOwner, expires_at: Date.now() + 30 * 86400_000 }); revocations = revocations.slice(-20);
    }
  } catch { /* In-memory collection remains optional when local storage is unavailable. */ }
  useAuthStore.subscribe(() => { if (syncOwner()) void synchronize(); });
  try { const info = await getNativeAppInfo(); analyticsCollector.setVersion(info.versionName, info.versionCode); currentVersion = info.versionName; }
  catch { /* Unsupported bridges are not treated as user-visible errors. */ }
  if (typeof window !== 'undefined') {
    window.addEventListener('nordicanalyticsdiagnostics', handleNativeDiagnostics as EventListener);
    window.addEventListener('error', event => recordClientError(event.error));
    window.addEventListener('unhandledrejection', event => recordClientError(event.reason));
  }
  await synchronize();
}
let nativeRequest = '';
function readNativeDiagnostics() {
  if (!preference.diagnostics || !foreground) return;
  const bridge = (globalThis as { NordicAnalytics?: { getExitDiagnostics: (id: string, since: number) => void } }).NordicAnalytics;
  if (!bridge) return;
  try { nativeRequest = uuid(); bridge.getExitDiagnostics(nativeRequest, diagnosticSince); }
  catch { /* Native diagnostics is best effort and never affects startup. */ }
}
function handleNativeDiagnostics(event: CustomEvent<unknown>) {
  if (!preference.diagnostics || !event.detail || typeof event.detail !== 'object') return;
  const value = event.detail as { requestId?: string; supported?: boolean; events?: Array<{ timestamp?: number; reason?: string }> };
  if (value.requestId !== nativeRequest || value.supported !== true || !Array.isArray(value.events)) return;
  const cutoff = Date.now();
  for (const item of value.events.slice(0, 16)) {
    if (!item.timestamp || item.timestamp <= diagnosticSince || item.timestamp > cutoff || !['crash', 'native_crash', 'anr'].includes(item.reason ?? '')) continue;
    trackAnalytics('native_diagnostic', { stage: 'previous_process', error_type: item.reason ?? 'unknown' });
  }
  diagnosticSince = cutoff; persistPreference();
}

function recordClientError(error: unknown) {
  if (!preference.diagnostics) return;
  const name = error instanceof Error && ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError'].includes(error.name) ? error.name : 'UnknownError';
  trackAnalytics('client_error', { module: 'app', error_type: name, error_fingerprint: `app:${name}`, severity: 'error' });
}

let observedPermission = '';
export function recordNotificationPermission(value: string) {
  const status = ['granted', 'denied', 'prompt'].includes(value) ? value : 'unknown';
  if (status === observedPermission) return;
  observedPermission = status; trackAnalytics('notification_permission_result', { status });
}
