import type { createClient } from "@supabase/supabase-js";

type RealtimeTransport = NonNullable<NonNullable<Parameters<typeof createClient>[2]>["realtime"]>["transport"];

/**
 * The mini-program does not use Supabase Realtime. Supplying this transport
 * prevents the SDK constructor from requiring a browser WebSocket; any future
 * attempt to subscribe fails explicitly instead of silently degrading.
 */
class UnavailableWechatRealtimeTransport {
  constructor() {
    throw new Error("Supabase Realtime is not available in the WeChat mini-program runtime");
  }
}

export const unavailableWechatRealtimeTransport = UnavailableWechatRealtimeTransport as unknown as RealtimeTransport;
