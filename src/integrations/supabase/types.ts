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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      api_clients: {
        Row: {
          allowed_providers: string[] | null
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          rate_limit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_providers?: string[] | null
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          rate_limit?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_providers?: string[] | null
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          rate_limit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_credentials: {
        Row: {
          cooldown_until: string | null
          created_at: string
          credentials: Json
          failed_requests: number
          id: string
          label: string | null
          last_used_at: string | null
          provider_name: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          status: Database["public"]["Enums"]["credential_status"]
          total_requests: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          credentials?: Json
          failed_requests?: number
          id?: string
          label?: string | null
          last_used_at?: string | null
          provider_name: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          status?: Database["public"]["Enums"]["credential_status"]
          total_requests?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          credentials?: Json
          failed_requests?: number
          id?: string
          label?: string | null
          last_used_at?: string | null
          provider_name?: string
          provider_type?: Database["public"]["Enums"]["provider_type"]
          status?: Database["public"]["Enums"]["credential_status"]
          total_requests?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      request_logs: {
        Row: {
          api_client_id: string | null
          created_at: string
          credential_id: string | null
          endpoint: string | null
          error_message: string | null
          id: string
          method: string
          provider_name: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          response_time_ms: number | null
          status_code: number | null
          user_id: string
        }
        Insert: {
          api_client_id?: string | null
          created_at?: string
          credential_id?: string | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          method?: string
          provider_name: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          response_time_ms?: number | null
          status_code?: number | null
          user_id: string
        }
        Update: {
          api_client_id?: string | null
          created_at?: string
          credential_id?: string | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          method?: string
          provider_name?: string
          provider_type?: Database["public"]["Enums"]["provider_type"]
          response_time_ms?: number | null
          status_code?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_logs_api_client_id_fkey"
            columns: ["api_client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_logs_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "provider_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      credential_status: "active" | "cooldown" | "disabled"
      provider_type: "ai" | "media" | "automation"
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
    Enums: {
      credential_status: ["active", "cooldown", "disabled"],
      provider_type: ["ai", "media", "automation"],
    },
  },
} as const
