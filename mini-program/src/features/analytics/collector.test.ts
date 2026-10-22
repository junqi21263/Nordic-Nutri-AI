import { describe, expect, it, vi } from 'vitest';
import { createAnalyticsCollector, type CollectionGrant, type AnalyticsEvent } from './collector';

const grant: CollectionGrant = { consent_revision: 'revision-1', collection_token: 'test-token', expires_at: '2030-01-01T00:00:00Z', analytics: true, diagnostics: false };
function setup() {
  let now = Date.parse('2026-10-21T01:00:00Z'); let id = 0;
  const send = vi.fn(async (_token: string, events: AnalyticsEvent[]) => ({ status: 200, results: events.map(e => ({ event_id: e.event_id, status: 'accepted' as const })) }));
  const persist = vi.fn(async (_value: unknown) => undefined);
  const collector = createAnalyticsCollector({ now: () => now, uuid: () => `id-${++id}`, send, persist, schedule: () => undefined, cancel: () => undefined });
  return { collector, send, persist, advance: (ms: number) => now += ms };
}
describe('silent bounded analytics collector', () => {
  it('does not generate IDs, queue or send before consent and drops sensitive/unknown attributes', async () => {
    const s = setup(); s.collector.track('screen_view', {}, { page_key: 'home' });
    expect(s.collector.snapshot().events).toEqual([]); await s.collector.flush(); expect(s.send).not.toHaveBeenCalled();
    s.collector.setGrant(grant); s.collector.setForeground(true);
    s.collector.track('screen_view', { page_key: 'home', email: 'private@example.com' });
    expect(s.collector.snapshot().events).toHaveLength(0);
    s.collector.track('meal_saved', {}); expect(s.collector.snapshot().events).toHaveLength(0);
    s.collector.track('screen_view', {}, { page_key: 'home' }); expect(s.collector.snapshot().events).toHaveLength(1);
  });
  it('batches at 50, acknowledges individual IDs and retries preserve IDs', async () => {
    const s = setup(); s.collector.setGrant(grant); s.collector.setForeground(true);
    for (let i = 0; i < 65; i++) s.collector.track('screen_view', {}, { page_key: 'home' });
    const id = s.collector.snapshot().events[0].event_id;
    s.send.mockImplementationOnce(async (_t, events) => ({ status: 200, results: events.slice(1).map(e => ({ event_id: e.event_id, status: 'accepted' as const })) }));
    await s.collector.flush(); expect(s.send.mock.calls[0][1]).toHaveLength(50);
    expect(s.collector.snapshot().events[0].event_id).toBe(id);
    s.advance(60_000); await s.collector.flush(); expect(s.send.mock.calls[1][1][0].event_id).toBe(id);
  });
  it('never sends during critical flows or while backgrounded', async () => {
    const s = setup(); s.collector.setGrant(grant); s.collector.track('screen_view', {}, { page_key: 'home' });
    await s.collector.flush(); expect(s.send).not.toHaveBeenCalled(); s.collector.setForeground(true);
    const done = s.collector.pause(); await s.collector.flush(); expect(s.send).not.toHaveBeenCalled();
    done(); await s.collector.flush(); expect(s.send).toHaveBeenCalledTimes(1);
  });
  it('bounds queue, expires offline events and clears identity on revoke or account switch', async () => {
    const s = setup(); s.collector.setOwner('A'); s.collector.setGrant(grant);
    for (let i = 0; i < 1100; i++) s.collector.track('screen_view', {}, { page_key: 'home' });
    expect(s.collector.snapshot().events.length).toBe(1000); s.advance(73 * 3600_000);
    s.collector.setForeground(true); await s.collector.flush(); expect(s.send).not.toHaveBeenCalled();
    s.collector.track('screen_view', {}, { page_key: 'home' }); s.collector.setOwner('B');
    expect(s.collector.snapshot().events).toEqual([]); expect(s.collector.snapshot().grant).toBeNull();
    s.collector.setGrant(grant); s.collector.track('screen_view', {}, { page_key: 'home' }); s.collector.revoke();
    expect(s.collector.snapshot().anonymous_id).toBe(''); expect(s.collector.snapshot().events).toEqual([]);
  });
  it('isolates network/storage faults, limits retries and does not refresh authentication', async () => {
    const s = setup(); s.persist.mockRejectedValue(new Error('storage unavailable'));
    s.send.mockRejectedValue(new Error('offline')); s.collector.setGrant(grant); s.collector.setForeground(true);
    s.collector.track('screen_view', {}, { page_key: 'home' });
    for (let i = 0; i < 10; i++) { await expect(s.collector.flush()).resolves.toBeUndefined(); s.advance(3600_000); }
    expect(s.send).toHaveBeenCalledTimes(5);
    s.collector.setForeground(false); s.collector.setForeground(true); s.send.mockResolvedValue({ status: 401, results: [] });
    await s.collector.flush(); await s.collector.flush(); expect(s.send).toHaveBeenCalledTimes(6);
  });
  it('does not accept stale restored consent, expired grant or another owner queue', () => {
    const s = setup(); s.collector.setOwner('B');
    s.collector.restore({ owner: 'A', anonymous_id: 'private', session_id: 'old', grant, events: [] });
    expect(s.collector.snapshot().anonymous_id).toBe('');
    s.collector.setGrant({ ...grant, expires_at: '2020-01-01T00:00:00Z' });
    s.collector.track('screen_view', {}, { page_key: 'home' }); expect(s.collector.snapshot().events).toEqual([]);
  });
});
