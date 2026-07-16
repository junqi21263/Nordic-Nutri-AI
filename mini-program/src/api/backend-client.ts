import { getSupabaseClient } from "../lib/supabase-client";
import { isUnauthorizedRequestError } from "./request-error";

export async function withAuthRefresh<T>(request: () => Promise<T>, refresh: () => Promise<unknown>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isUnauthorizedRequestError(error)) throw error;
    if (!(await refresh())) throw error;
    return request();
  }
}

export const backendClient = { supabase: getSupabaseClient };
