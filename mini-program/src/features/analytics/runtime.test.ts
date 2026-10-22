import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let stored: unknown;
vi.mock('./persistence', () => ({ createAnalyticsPersistence: () => ({ read: async () => stored, write: async (value: unknown) => { stored = structuredClone(value); } }) }));
vi.mock('../app-update/native', () => ({ getNativeAppInfo: async () => ({ versionName: '1.1.30', versionCode: 30, installerPackage: null }) }));
const grant = { analytics: true, diagnostics: false, consent_revision: 'revision-1', collection_token: 'limited-credential', expires_at: '2030-01-01T00:00:00Z' };
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body, headers: { get: () => null } });
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.stubEnv('TARO_APP_PLATFORM', 'android'); stored = undefined; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Android silent transport integration', () => {
  it('starts disabled with no anonymous identifier, invitations or network on an anonymous install', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const runtime = await import('./runtime'); await runtime.initializeAnalytics(); runtime.setAnalyticsForeground(true); await settle();
    expect(fetcher).not.toHaveBeenCalled(); expect(runtime.analyticsCollector.snapshot().anonymous_id).toBe('');
    expect(runtime.getAnalyticsPreference()).toEqual({ analytics: false, diagnostics: false });
  });
  it('does not inherit account consent or create an identifier on a new device', async () => {
    const fetcher = vi.fn(async () => response(grant)); vi.stubGlobal('fetch', fetcher);
    const { useAuthStore } = await import('../../auth/auth-store');
    useAuthStore.getState().setSession({ user: { id: 'A' }, accessToken: 'business-token' });
    const runtime = await import('./runtime'); await runtime.initializeAnalytics(); runtime.setAnalyticsForeground(true); await settle();
    expect(fetcher).not.toHaveBeenCalled();
    expect(runtime.analyticsCollector.snapshot().anonymous_id).toBe('');
    runtime.setAnalyticsPreference({ analytics: false, diagnostics: false });
    expect(runtime.analyticsCollector.snapshot().anonymous_id).toBe('');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses the existing Bearer only as read-only identity, never clears or refreshes auth for an analytics 401', async () => {
    const fetcher = vi.fn(async (url: string) => response(url.includes('/consent') ? grant : {}, url.includes('/batch') ? 401 : 200));
    vi.stubGlobal('fetch', fetcher);
    const { useAuthStore } = await import('../../auth/auth-store'); useAuthStore.getState().setSession({ user: { id: 'A' }, accessToken: 'business-token' });
    const runtime = await import('./runtime'); await runtime.initializeAnalytics(); runtime.setAnalyticsForeground(true);
    runtime.setAnalyticsPreference({ analytics: true, diagnostics: false }); await settle();
    runtime.trackAnalytics('screen_view', {}, { page_key: 'home' }); await runtime.analyticsCollector.flush();
    expect(useAuthStore.getState().session?.accessToken).toBe('business-token');
    expect(fetcher.mock.calls.some(([url]) => url.includes('/auth/'))).toBe(false);
    const batch = fetcher.mock.calls.find(([url]) => url.includes('/batch')); expect(batch).toBeDefined();
    expect(runtime.analyticsCollector.snapshot().events.map(event => event.event_name)).toContain('screen_view');
  });
  it('keeps opt-out locally even offline and persists the previous credential for revocation', async () => {
    const fetcher = vi.fn(async () => response(grant)); vi.stubGlobal('fetch', fetcher);
    const runtime = await import('./runtime'); await runtime.initializeAnalytics(); runtime.setAnalyticsForeground(true);
    runtime.setAnalyticsPreference({ analytics: true, diagnostics: false }); await settle();
    const previousId = runtime.analyticsCollector.snapshot().anonymous_id; expect(previousId).not.toBe('');
    runtime.trackAnalytics('screen_view', {}, { page_key: 'home' });
    fetcher.mockRejectedValue(new Error('offline'));
    runtime.setAnalyticsPreference({ analytics: false, diagnostics: false }); await settle();
    expect(runtime.analyticsCollector.snapshot().events).toEqual([]); expect(runtime.getAnalyticsPreference().analytics).toBe(false);
    expect(stored).toMatchObject({ pending: true, preference: { analytics: false }, choice: { anonymous_id: previousId, collection_token: 'limited-credential' } });
  });
  it('holds a restored offline queue until this installation consent is checked', async () => {
    const first = vi.fn(async () => response(grant)); vi.stubGlobal('fetch', first);
    const firstRuntime = await import('./runtime'); await firstRuntime.initializeAnalytics(); firstRuntime.setAnalyticsForeground(true);
    firstRuntime.setAnalyticsPreference({ analytics: true, diagnostics: false }); await settle();
    firstRuntime.trackAnalytics('screen_view', {}, { page_key: 'home' });
    await vi.advanceTimersByTimeAsync(500);
    expect((stored as { collector: { events: unknown[] } }).collector.events.length).toBeGreaterThan(0);
    vi.resetModules();
    let answer!: (value: ReturnType<typeof response>) => void;
    const check = new Promise<ReturnType<typeof response>>(resolve => { answer = resolve; });
    const second = vi.fn(async (url: string) => url.includes('/consent?') ? check : response({ results: [] }));
    vi.stubGlobal('fetch', second);
    const restored = await import('./runtime'); await restored.initializeAnalytics(); restored.setAnalyticsForeground(true);
    await settle(); await restored.analyticsCollector.flush();
    expect(second.mock.calls.filter(([url]) => url.includes('/batch'))).toHaveLength(0);
    answer(response(grant)); await settle(); await restored.analyticsCollector.flush();
    expect(second.mock.calls.filter(([url]) => url.includes('/batch'))).toHaveLength(1);
  });
  it('keeps offline revocation bound to its owner across a switch and never sends A command with B auth', async () => {
    const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => response(grant)); vi.stubGlobal('fetch', fetcher);
    const { useAuthStore } = await import('../../auth/auth-store'); useAuthStore.getState().setSession({ user: { id: 'A' }, accessToken: 'token-A' });
    const runtime = await import('./runtime'); await runtime.initializeAnalytics(); runtime.setAnalyticsForeground(true);
    runtime.setAnalyticsPreference({ analytics: true, diagnostics: false }); await settle();
    fetcher.mockRejectedValue(new Error('offline'));
    runtime.setAnalyticsPreference({ analytics: false, diagnostics: false }); await settle();
    useAuthStore.getState().setSession({ user: { id: 'B' }, accessToken: 'token-B' }); await settle();
    expect(stored).toMatchObject({ revocations: [expect.objectContaining({ owner: 'A', collection_token: 'limited-credential' })] });
    fetcher.mockClear(); fetcher.mockImplementation(async () => response({ analytics: false, diagnostics: false }));
    runtime.setAnalyticsForeground(false); runtime.setAnalyticsForeground(true); await settle();
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    expect(runtime.analyticsCollector.snapshot().events).toEqual([]);
  });

});
