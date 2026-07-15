import type { AuthClient, AuthResult } from "./types";

export async function registerWithPassword(
  client: AuthClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  return client.signUp({ email, password });
}

export async function loginWithPassword(
  client: AuthClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  return client.signInWithPassword({ email, password });
}
