export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_analysis: {
        Row: {
          advice: string | null
          asset_id: string | null
          client_request_id: string | null
          confidence: number | null
          created_at: string
          error_code: string | null
          expires_at: string
          id: string
          image_path: string
          image_sha256: string
          model: string
          normalized_items: Json | null
          provider: string
          raw_recognition: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          advice?: string | null
          asset_id?: string | null
          client_request_id?: string | null
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          expires_at?: string
          id?: string
          image_path: string
          image_sha256: string
          model: string
          normalized_items?: Json | null
          provider: string
          raw_recognition?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          advice?: string | null
          asset_id?: string | null
          client_request_id?: string | null
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          expires_at?: string
          id?: string
          image_path?: string
          image_sha256?: string
          model?: string
          normalized_items?: Json | null
          provider?: string
          raw_recognition?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "uploaded_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analysis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      body_profiles: {
        Row: {
          activity_level: string
          age: number
          birth_date: string | null
          created_at: string
          effective_at: string
          height_cm: number
          id: string
          is_current: boolean
          sex: string
          training_days_per_week: number
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          activity_level?: string
          age: number
          birth_date?: string | null
          created_at?: string
          effective_at?: string
          height_cm: number
          id?: string
          is_current?: boolean
          sex: string
          training_days_per_week?: number
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          activity_level?: string
          age?: number
          birth_date?: string | null
          created_at?: string
          effective_at?: string
          height_cm?: number
          id?: string
          is_current?: boolean
          sex?: string
          training_days_per_week?: number
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          answer: Json | null
          client_request_id: string | null
          content: string | null
          context_date: string
          context_snapshot: Json
          conversation_id: string | null
          created_at: string
          id: string
          model: string | null
          provider: string | null
          question_type: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          answer?: Json | null
          client_request_id?: string | null
          content?: string | null
          context_date?: string
          context_snapshot?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          provider?: string | null
          question_type?: string | null
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          answer?: Json | null
          client_request_id?: string | null
          content?: string | null
          context_date?: string
          context_snapshot?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          provider?: string | null
          question_type?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      food_catalog: {
        Row: {
          aliases: string[]
          calories_per_100g: number
          canonical_name: string
          carbs_g_per_100g: number
          created_at: string
          fat_g_per_100g: number
          id: string
          is_active: boolean
          protein_g_per_100g: number
          serving_unit: string
          source: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          calories_per_100g: number
          canonical_name: string
          carbs_g_per_100g: number
          created_at?: string
          fat_g_per_100g: number
          id?: string
          is_active?: boolean
          protein_g_per_100g: number
          serving_unit?: string
          source: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          calories_per_100g?: number
          canonical_name?: string
          carbs_g_per_100g?: number
          created_at?: string
          fat_g_per_100g?: number
          id?: string
          is_active?: boolean
          protein_g_per_100g?: number
          serving_unit?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      health_plan_items: {
        Row: {
          completed_at: string | null
          completion_status: string
          created_at: string
          guidance: string | null
          id: string
          meal_type: string | null
          nutrition_plan_id: string
          sequence: number
          target_calories_kcal: number | null
          target_carbs_g: number | null
          target_fat_g: number | null
          target_protein_g: number | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completion_status?: string
          created_at?: string
          guidance?: string | null
          id?: string
          meal_type?: string | null
          nutrition_plan_id: string
          sequence: number
          target_calories_kcal?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completion_status?: string
          created_at?: string
          guidance?: string | null
          id?: string
          meal_type?: string | null
          nutrition_plan_id?: string
          sequence?: number
          target_calories_kcal?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_plan_items_nutrition_plan_id_fkey"
            columns: ["nutrition_plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_items: {
        Row: {
          ai_quantity_g: number | null
          calories_per_100g: number
          carbs_g_per_100g: number
          confirmed_quantity_g: number
          created_at: string
          fat_g_per_100g: number
          food_id: string | null
          id: string
          meal_record_id: string
          name: string
          protein_g_per_100g: number
          updated_at: string
        }
        Insert: {
          ai_quantity_g?: number | null
          calories_per_100g: number
          carbs_g_per_100g: number
          confirmed_quantity_g: number
          created_at?: string
          fat_g_per_100g: number
          food_id?: string | null
          id?: string
          meal_record_id: string
          name: string
          protein_g_per_100g: number
          updated_at?: string
        }
        Update: {
          ai_quantity_g?: number | null
          calories_per_100g?: number
          carbs_g_per_100g?: number
          confirmed_quantity_g?: number
          created_at?: string
          fat_g_per_100g?: number
          food_id?: string | null
          id?: string
          meal_record_id?: string
          name?: string
          protein_g_per_100g?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_record_id_fkey"
            columns: ["meal_record_id"]
            isOneToOne: false
            referencedRelation: "active_meal_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_record_id_fkey"
            columns: ["meal_record_id"]
            isOneToOne: false
            referencedRelation: "meal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_records: {
        Row: {
          analysis_id: string | null
          calories_kcal: number
          carbs_g: number
          client_request_id: string | null
          created_at: string
          deleted_at: string | null
          fat_g: number
          id: string
          image_path: string | null
          is_favorite: boolean
          meal_type: string
          name: string
          plan_id: string | null
          protein_g: number
          recorded_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          calories_kcal?: number
          carbs_g?: number
          client_request_id?: string | null
          created_at?: string
          deleted_at?: string | null
          fat_g?: number
          id?: string
          image_path?: string | null
          is_favorite?: boolean
          meal_type?: string
          name: string
          plan_id?: string | null
          protein_g?: number
          recorded_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          calories_kcal?: number
          carbs_g?: number
          client_request_id?: string | null
          created_at?: string
          deleted_at?: string | null
          fat_g?: number
          id?: string
          image_path?: string | null
          is_favorite?: boolean
          meal_type?: string
          name?: string
          plan_id?: string | null
          protein_g?: number
          recorded_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_records_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "ai_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plans: {
        Row: {
          activated_at: string | null
          archived_at: string | null
          body_profile_id: string
          calculation_source: string
          carbs_g: number
          created_at: string
          daily_calories_kcal: number
          effective_from: string
          effective_to: string | null
          fat_g: number
          generation_request_id: string | null
          goal_id: string
          id: string
          protein_g: number
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          archived_at?: string | null
          body_profile_id: string
          calculation_source?: string
          carbs_g: number
          created_at?: string
          daily_calories_kcal: number
          effective_from?: string
          effective_to?: string | null
          fat_g: number
          generation_request_id?: string | null
          goal_id: string
          id?: string
          protein_g: number
          status?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          activated_at?: string | null
          archived_at?: string | null
          body_profile_id?: string
          calculation_source?: string
          carbs_g?: number
          created_at?: string
          daily_calories_kcal?: number
          effective_from?: string
          effective_to?: string | null
          fat_g?: number
          generation_request_id?: string | null
          goal_id?: string
          id?: string
          protein_g?: number
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_body_profile_id_fkey"
            columns: ["body_profile_id"]
            isOneToOne: false
            referencedRelation: "body_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "user_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          id: string
          last_login_at: string | null
          nickname: string | null
          onboarding_completed_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          id: string
          last_login_at?: string | null
          nickname?: string | null
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          id?: string
          last_login_at?: string | null
          nickname?: string | null
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_assets: {
        Row: {
          bucket_id: string
          byte_size: number
          content_type: string
          created_at: string
          id: string
          object_path: string
          sha256: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          content_type: string
          created_at?: string
          id?: string
          object_path: string
          sha256: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          content_type?: string
          created_at?: string
          id?: string
          object_path?: string
          sha256?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goals: {
        Row: {
          created_at: string
          goal_type: string
          id: string
          is_current: boolean
          target_date: string | null
          target_weight_kg: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_type: string
          id?: string
          is_current?: boolean
          target_date?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_type?: string
          id?: string
          is_current?: boolean
          target_date?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          developer_mode: boolean
          dietary_pattern: string
          food_avoidances: string[]
          id: string
          locale: string
          meals_per_day: number
          notification_enabled: boolean
          theme: string
          unit_system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          developer_mode?: boolean
          dietary_pattern?: string
          food_avoidances?: string[]
          id: string
          locale?: string
          meals_per_day?: number
          notification_enabled?: boolean
          theme?: string
          unit_system?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          developer_mode?: boolean
          dietary_pattern?: string
          food_avoidances?: string[]
          id?: string
          locale?: string
          meals_per_day?: number
          notification_enabled?: boolean
          theme?: string
          unit_system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wechat_identities: {
        Row: {
          created_at: string
          openid_ciphertext: string | null
          openid_hash: string
          unionid_ciphertext: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          openid_ciphertext?: string | null
          openid_hash: string
          unionid_ciphertext?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          openid_ciphertext?: string | null
          openid_hash?: string
          unionid_ciphertext?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wechat_login_codes: {
        Row: {
          code_hash: string
          expires_at: string
          used_at: string
          user_id: string
        }
        Insert: {
          code_hash: string
          expires_at?: string
          used_at?: string
          user_id: string
        }
        Update: {
          code_hash?: string
          expires_at?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_login_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_meal_records: {
        Row: {
          analysis_id: string | null
          calories_kcal: number | null
          carbs_g: number | null
          client_request_id: string | null
          created_at: string | null
          deleted_at: string | null
          fat_g: number | null
          id: string | null
          image_path: string | null
          is_favorite: boolean | null
          meal_type: string | null
          name: string | null
          plan_id: string | null
          protein_g: number | null
          recorded_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          analysis_id?: string | null
          calories_kcal?: number | null
          carbs_g?: number | null
          client_request_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          fat_g?: number | null
          id?: string | null
          image_path?: string | null
          is_favorite?: boolean | null
          meal_type?: string | null
          name?: string | null
          plan_id?: string | null
          protein_g?: number | null
          recorded_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          analysis_id?: string | null
          calories_kcal?: number | null
          carbs_g?: number | null
          client_request_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          fat_g?: number | null
          id?: string | null
          image_path?: string | null
          is_favorite?: boolean | null
          meal_type?: string | null
          name?: string | null
          plan_id?: string | null
          protein_g?: number | null
          recorded_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_records_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "ai_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      save_meal_atomic: { Args: { p_input: Json }; Returns: Json }
      update_meal_atomic: { Args: { p_input: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
