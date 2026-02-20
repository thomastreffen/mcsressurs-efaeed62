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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Relationships: []
      }
      calculation_items: {
        Row: {
          calculation_id: string
          created_at: string
          description: string | null
          id: string
          quantity: number
          suggested_by_ai: boolean | null
          title: string
          total_price: number
          type: Database["public"]["Enums"]["calculation_item_type"]
          unit: string | null
          unit_price: number
        }
        Insert: {
          calculation_id: string
          created_at?: string
          description?: string | null
          id?: string
          quantity?: number
          suggested_by_ai?: boolean | null
          title: string
          total_price?: number
          type: Database["public"]["Enums"]["calculation_item_type"]
          unit?: string | null
          unit_price?: number
        }
        Update: {
          calculation_id?: string
          created_at?: string
          description?: string | null
          id?: string
          quantity?: number
          suggested_by_ai?: boolean | null
          title?: string
          total_price?: number
          type?: Database["public"]["Enums"]["calculation_item_type"]
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "calculation_items_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      calculations: {
        Row: {
          ai_analysis: Json | null
          attachments: Json | null
          created_at: string
          created_by: string
          customer_email: string | null
          customer_name: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          lead_id: string | null
          project_title: string
          status: Database["public"]["Enums"]["calculation_status"]
          total_labor: number | null
          total_material: number | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          attachments?: Json | null
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_name: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          project_title: string
          status?: Database["public"]["Enums"]["calculation_status"]
          total_labor?: number | null
          total_material?: number | null
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          attachments?: Json | null
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_name?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          project_title?: string
          status?: Database["public"]["Enums"]["calculation_status"]
          total_labor?: number | null
          total_material?: number | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          bank_account: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          default_offer_conditions: string | null
          default_offer_footer: string | null
          default_offer_valid_days: number | null
          default_payment_terms: string | null
          email: string | null
          iban: string | null
          id: string
          logo_url: string | null
          org_number: string | null
          phone: string | null
          postal_code: string | null
          primary_color: string | null
          secondary_color: string | null
          swift: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          default_offer_conditions?: string | null
          default_offer_footer?: string | null
          default_offer_valid_days?: number | null
          default_payment_terms?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          org_number?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          swift?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          default_offer_conditions?: string | null
          default_offer_footer?: string | null
          default_offer_valid_days?: number | null
          default_payment_terms?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          org_number?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          swift?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      event_logs: {
        Row: {
          action_type: string
          change_summary: string | null
          event_id: string
          id: string
          performed_by: string | null
          timestamp: string
        }
        Insert: {
          action_type: string
          change_summary?: string | null
          event_id: string
          id?: string
          performed_by?: string | null
          timestamp?: string
        }
        Update: {
          action_type?: string
          change_summary?: string | null
          event_id?: string
          id?: string
          performed_by?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_technicians: {
        Row: {
          created_at: string
          event_id: string
          id: string
          technician_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          technician_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_technicians_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_technicians_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          attachments: Json | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          customer: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          editing_by: string | null
          editing_started_at: string | null
          end_time: string
          id: string
          internal_number: string | null
          job_number: string | null
          microsoft_event_id: string | null
          offer_id: string | null
          outlook_deleted_at: string | null
          outlook_last_synced_at: string | null
          outlook_sync_status: string
          proposed_end: string | null
          proposed_start: string | null
          start_time: string
          status: Database["public"]["Enums"]["job_status"]
          technician_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          attachments?: Json | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          editing_by?: string | null
          editing_started_at?: string | null
          end_time: string
          id?: string
          internal_number?: string | null
          job_number?: string | null
          microsoft_event_id?: string | null
          offer_id?: string | null
          outlook_deleted_at?: string | null
          outlook_last_synced_at?: string | null
          outlook_sync_status?: string
          proposed_end?: string | null
          proposed_start?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["job_status"]
          technician_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          attachments?: Json | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          editing_by?: string | null
          editing_started_at?: string | null
          end_time?: string
          id?: string
          internal_number?: string | null
          job_number?: string | null
          microsoft_event_id?: string | null
          offer_id?: string | null
          outlook_deleted_at?: string | null
          outlook_last_synced_at?: string | null
          outlook_sync_status?: string
          proposed_end?: string | null
          proposed_start?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["job_status"]
          technician_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      job_approvals: {
        Row: {
          comment: string | null
          created_at: string
          expires_at: string
          id: string
          job_id: string
          outlook_event_id: string | null
          proposed_end: string | null
          proposed_start: string | null
          responded_at: string | null
          status: string
          technician_user_id: string
          token: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id: string
          outlook_event_id?: string | null
          proposed_end?: string | null
          proposed_start?: string | null
          responded_at?: string | null
          status?: string
          technician_user_id: string
          token?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id?: string
          outlook_event_id?: string | null
          proposed_end?: string | null
          proposed_start?: string | null
          responded_at?: string | null
          status?: string
          technician_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_approvals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          probability: number | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: []
      }
      microsoft_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          message?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          accepted_at: string | null
          accepted_ip: string | null
          archived_at: string | null
          archived_by: string | null
          calculation_id: string
          content_hash: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          generated_html_snapshot: string | null
          generated_pdf_url: string | null
          id: string
          lead_id: string | null
          offer_number: string
          public_token: string | null
          sent_at: string | null
          sent_to_email: string | null
          status: Database["public"]["Enums"]["offer_status"]
          total_ex_vat: number
          total_inc_vat: number
          valid_until: string | null
          version: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_ip?: string | null
          archived_at?: string | null
          archived_by?: string | null
          calculation_id: string
          content_hash?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          generated_html_snapshot?: string | null
          generated_pdf_url?: string | null
          id?: string
          lead_id?: string | null
          offer_number: string
          public_token?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          total_ex_vat?: number
          total_inc_vat?: number
          valid_until?: string | null
          version?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_ip?: string | null
          archived_at?: string | null
          archived_by?: string | null
          calculation_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          generated_html_snapshot?: string | null
          generated_pdf_url?: string | null
          id?: string
          lead_id?: string | null
          offer_number?: string
          public_token?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          total_ex_vat?: number
          total_inc_vat?: number
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      technicians: {
        Row: {
          color: string | null
          created_at: string
          email: string
          id: string
          microsoft_user_id: string | null
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          email: string
          id?: string
          microsoft_user_id?: string | null
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          email?: string
          id?: string
          microsoft_user_id?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "montør" | "super_admin"
      calculation_item_type: "material" | "labor"
      calculation_status:
        | "draft"
        | "generated"
        | "sent"
        | "accepted"
        | "rejected"
        | "converted"
      event_status: "pending" | "accepted" | "declined" | "change_request"
      job_status:
        | "requested"
        | "approved"
        | "time_change_proposed"
        | "rejected"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "ready_for_invoicing"
        | "invoiced"
        | "archived"
      lead_status: "new" | "contacted" | "qualified" | "lost" | "won"
      offer_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "signed"
        | "archived"
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
      app_role: ["admin", "montør", "super_admin"],
      calculation_item_type: ["material", "labor"],
      calculation_status: [
        "draft",
        "generated",
        "sent",
        "accepted",
        "rejected",
        "converted",
      ],
      event_status: ["pending", "accepted", "declined", "change_request"],
      job_status: [
        "requested",
        "approved",
        "time_change_proposed",
        "rejected",
        "scheduled",
        "in_progress",
        "completed",
        "ready_for_invoicing",
        "invoiced",
        "archived",
      ],
      lead_status: ["new", "contacted", "qualified", "lost", "won"],
      offer_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "signed",
        "archived",
      ],
    },
  },
} as const
