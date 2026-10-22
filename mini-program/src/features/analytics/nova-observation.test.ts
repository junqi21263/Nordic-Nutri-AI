import { expect, it, vi } from 'vitest';
import { createNovaObservation } from './nova-observation';
it('records only the first chunk and one protocol-observed display terminal, never message content', () => {
  const track = vi.fn(); const observation = createNovaObservation(track, 'op', () => 1000);
  for (let i = 0; i < 100; i++) observation.delta();
  observation.completed(); observation.failed(new Error('private conversation'));
  expect(track.mock.calls.map(call => call[0])).toEqual(['nova_request_started', 'nova_first_chunk', 'nova_display_terminal']);
  expect(track.mock.calls[2][1]).toMatchObject({ outcome: 'completed', received_chunk_count: 100 });
});
it('does not turn disconnection or navigation into a completed answer', () => {
  const track = vi.fn(); createNovaObservation(track, 'op').failed(new TypeError('private URL/token'));
  expect(track.mock.calls.at(-1)?.[1]).toMatchObject({ outcome: 'network_failed' });
  const next = createNovaObservation(track, 'op2'); next.failed(new Error('abort'), 'navigation_cancelled');
  expect(track.mock.calls.at(-1)?.[1]).toMatchObject({ outcome: 'navigation_cancelled' });
});
