import type { AnalyticsValue } from './collector';
export interface ProductObservation { name: string; properties: Record<string, AnalyticsValue> }
/** Deliberately accepts only routing and boolean structural facts, never a business payload. */
export function productRequestObservation(path: string, method: string, phase: 'start' | 'success', fromScan = false, fromTemplate = false): ProductObservation | null {
  const route = path.split('?')[0];
  if (route === '/meals' && method === 'POST' && phase === 'start') return { name: 'meal_save_clicked', properties: { entry: fromTemplate ? 'template' : fromScan ? 'scan' : 'manual' } };
  if (route === '/smart-reminders' && method === 'PUT' && phase === 'success') return null;
  if (route === '/feedback/read' && method === 'POST' && phase === 'success') return { name: 'feedback_reply_viewed', properties: {} };
  return null;
}
export function analyticsPageKey(route: string | undefined) {
  const match = /^\/?pages\/([a-z][a-z-]{0,50})\/index$/.exec(route ?? '');
  return match?.[1] ?? 'unknown';
}
export function nativeGoogleErrorType(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.name : '';
  const allowed = new Set(['GOOGLE_SIGN_IN_CANCELLED', 'GOOGLE_SIGN_IN_FAILED', 'GOOGLE_SIGN_IN_TIMEOUT', 'GOOGLE_BRIDGE_UNAVAILABLE', 'GOOGLE_CLIENT_ID_MISSING', 'GOOGLE_ACTIVITY_UNAVAILABLE', 'GOOGLE_CREDENTIAL_UNAVAILABLE', 'GOOGLE_CREDENTIAL_ERROR', 'AUTH_PROVIDER_UNAVAILABLE', 'AUTH_NETWORK_ERROR', 'AUTH_INVALID_CREDENTIALS']);
  return allowed.has(code) ? code : 'unknown';
}
