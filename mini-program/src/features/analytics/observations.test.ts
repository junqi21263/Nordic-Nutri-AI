import { expect, it } from 'vitest';
import { analyticsPageKey, nativeGoogleErrorType, productRequestObservation } from './observations';
it('maps only user observations and never makes server success from a client HTTP response', () => {
  expect(productRequestObservation('/meals', 'POST', 'start', true)).toEqual({ name: 'meal_save_clicked', properties: { entry: 'scan' } });
  expect(productRequestObservation('/meals', 'POST', 'success')).toBeNull();
  expect(productRequestObservation('/push-tokens', 'POST', 'success')).toBeNull();
  expect(productRequestObservation('/meals?email=private@example.com', 'POST', 'start')?.properties).toEqual({ entry: 'manual' });
});
it('rejects dynamic pages and native error content, retaining only controlled stages/types', () => {
  expect(analyticsPageKey('/pages/meal-detail/index')).toBe('meal-detail');
  expect(analyticsPageKey('pages/home/index?token=secret')).toBe('unknown');
  expect(nativeGoogleErrorType(new Error('person@example.com'))).toBe('unknown');
  expect(nativeGoogleErrorType({ code: 'GOOGLE_SIGN_IN_CANCELLED' })).toBe('GOOGLE_SIGN_IN_CANCELLED');
});
