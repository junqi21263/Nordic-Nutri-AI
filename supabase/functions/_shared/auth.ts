import { createClient, type User } from "npm:@supabase/supabase-js@2";
import { unauthorized } from "./errors.ts";

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getPublishableKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyKey) return legacyKey;

  const keys = JSON.parse(getRequiredEnv("SUPABASE_PUBLISHABLE_KEYS")) as Record<string, string>;
  const key = keys.default;
  if (!key) throw new Error("Missing default Supabase publishable key");
  return key;
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  return authorization.slice("Bearer ".length);
}

export async function requireUser(request: Request): Promise<User> {
  const token = getBearerToken(request);
  const client = createClient(getRequiredEnv("SUPABASE_URL"), getPublishableKey());
  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) throw unauthorized("Invalid or expired session");
  return data.user;
}
