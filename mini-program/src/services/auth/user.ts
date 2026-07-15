import type { AuthClient, AuthUser } from "./types";

export async function getCurrentUser(client: AuthClient): Promise<AuthUser | null> {
  return client.getUser();
}
