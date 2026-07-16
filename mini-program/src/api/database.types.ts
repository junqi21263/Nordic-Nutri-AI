// Phase 1 hand-maintained public-schema projection. Regenerate before enabling
// live queries: `pnpm exec supabase gen types typescript --local --schema public`.
export interface Database {
  public: { Tables: {
    profiles: { Row: { id: string; nickname: string | null; avatar_path: string | null; timezone: string; onboarding_completed_at: string | null; created_at: string; updated_at: string }; Insert: never; Update: { nickname?: string | null; avatar_path?: string | null; timezone?: string; onboarding_completed_at?: string | null } };
    user_settings: { Row: { id: string; dietary_pattern: string; food_avoidances: string[]; meals_per_day: number; theme: string; locale: string; unit_system: string; notification_enabled: boolean; developer_mode: boolean; created_at: string; updated_at: string }; Insert: never; Update: Partial<Omit<Database["public"]["Tables"]["user_settings"]["Row"], "id" | "created_at" | "updated_at">> };
    body_profiles: { Row: { id: string; user_id: string; age: number; sex: string; height_cm: number; weight_kg: number; activity_level: string; training_days_per_week: number; is_current: boolean; effective_at: string; created_at: string; updated_at: string }; Insert: Omit<Database["public"]["Tables"]["body_profiles"]["Row"], "id" | "created_at" | "updated_at">; Update: Partial<Database["public"]["Tables"]["body_profiles"]["Insert"]> };
    user_goals: { Row: { id: string; user_id: string; goal_type: string; target_weight_kg: number | null; target_date: string | null; is_current: boolean; created_at: string; updated_at: string }; Insert: Omit<Database["public"]["Tables"]["user_goals"]["Row"], "id" | "created_at" | "updated_at">; Update: Partial<Database["public"]["Tables"]["user_goals"]["Insert"]> };
    meal_records: { Row: { id: string; user_id: string; name: string; meal_type: string; recorded_at: string; calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number; deleted_at: string | null; client_request_id: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown> };
    meal_items: { Row: { id: string; meal_record_id: string; name: string; confirmed_quantity_g: number; calories_per_100g: number; protein_g_per_100g: number; carbs_g_per_100g: number; fat_g_per_100g: number }; Insert: Record<string, unknown>; Update: Record<string, unknown> };
  } };
}
