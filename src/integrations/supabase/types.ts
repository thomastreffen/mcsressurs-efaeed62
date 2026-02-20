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
          microsoft_event_id: string | null
          microsoft_message_id: string | null
          performed_by: string | null
          title: string | null
          type: string
          visibility: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          microsoft_event_id?: string | null
          microsoft_message_id?: string | null
          performed_by?: string | null
          title?: string | null
          type?: string
          visibility?: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          microsoft_event_id?: string | null
          microsoft_message_id?: string | null
          performed_by?: string | null
          title?: string | null
          type?: string
          visibility?: string
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
          company_id: string | null
          created_at: string
          created_by: string
          customer_email: string | null
          customer_name: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
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
          company_id?: string | null
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_name: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
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
          company_id?: string | null
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_name?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
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
            foreignKeyName: "calculations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_logs: {
        Row: {
          bcc_recipients: Json | null
          body_preview: string | null
          cc_recipients: Json | null
          conversation_id: string | null
          created_at: string
          created_by: string
          direction: string
          entity_id: string
          entity_type: string
          graph_message_id: string | null
          id: string
          internet_message_id: string | null
          last_error: Json | null
          last_operation_at: string | null
          last_operation_id: string | null
          mode: string
          outlook_weblink: string | null
          ref_code: string | null
          send_hash: string | null
          subject: string
          to_recipients: Json
          updated_at: string
        }
        Insert: {
          bcc_recipients?: Json | null
          body_preview?: string | null
          cc_recipients?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_by: string
          direction?: string
          entity_id: string
          entity_type: string
          graph_message_id?: string | null
          id?: string
          internet_message_id?: string | null
          last_error?: Json | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          mode?: string
          outlook_weblink?: string | null
          ref_code?: string | null
          send_hash?: string | null
          subject?: string
          to_recipients?: Json
          updated_at?: string
        }
        Update: {
          bcc_recipients?: Json | null
          body_preview?: string | null
          cc_recipients?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          direction?: string
          entity_id?: string
          entity_type?: string
          graph_message_id?: string | null
          id?: string
          internet_message_id?: string | null
          last_error?: Json | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          mode?: string
          outlook_weblink?: string | null
          ref_code?: string | null
          send_hash?: string | null
          subject?: string
          to_recipients?: Json
          updated_at?: string
        }
        Relationships: []
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
      departments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
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
          calendar_dirty: boolean
          calendar_last_synced_at: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          customer: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
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
          calendar_dirty?: boolean
          calendar_last_synced_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
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
          calendar_dirty?: boolean
          calendar_last_synced_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
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
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
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
      internal_companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_number?: string | null
        }
        Relationships: []
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
      job_calendar_audit: {
        Row: {
          action: string
          created_at: string
          failures_count: number
          finished_at: string | null
          id: string
          job_id: string
          operation_id: string
          override_conflicts: boolean
          performed_by: string
          started_at: string
          successes_count: number
          summary: Json | null
          technicians_count: number
        }
        Insert: {
          action: string
          created_at?: string
          failures_count?: number
          finished_at?: string | null
          id?: string
          job_id: string
          operation_id: string
          override_conflicts?: boolean
          performed_by: string
          started_at?: string
          successes_count?: number
          summary?: Json | null
          technicians_count?: number
        }
        Update: {
          action?: string
          created_at?: string
          failures_count?: number
          finished_at?: string | null
          id?: string
          job_id?: string
          operation_id?: string
          override_conflicts?: boolean
          performed_by?: string
          started_at?: string
          successes_count?: number
          summary?: Json | null
          technicians_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_calendar_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_calendar_links: {
        Row: {
          calendar_event_id: string | null
          calendar_event_url: string | null
          created_at: string
          id: string
          job_id: string
          last_error: string | null
          last_operation_at: string | null
          last_operation_id: string | null
          last_sync_hash: string | null
          last_synced_at: string | null
          provider: string
          sync_status: string
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          calendar_event_url?: string | null
          created_at?: string
          id?: string
          job_id: string
          last_error?: string | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          last_sync_hash?: string | null
          last_synced_at?: string | null
          provider?: string
          sync_status?: string
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          calendar_event_url?: string | null
          created_at?: string
          id?: string
          job_id?: string
          last_error?: string | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          last_sync_hash?: string | null
          last_synced_at?: string | null
          provider?: string
          sync_status?: string
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_calendar_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_calendar_links_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      job_participants: {
        Row: {
          created_at: string
          id: string
          job_id: string
          role_label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          role_label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          role_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_participants_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_calendar_links: {
        Row: {
          attendee_emails: string[] | null
          created_at: string
          created_by: string | null
          event_end: string | null
          event_location: string | null
          event_start: string | null
          event_subject: string | null
          id: string
          last_synced_at: string | null
          lead_id: string
          outlook_event_id: string
        }
        Insert: {
          attendee_emails?: string[] | null
          created_at?: string
          created_by?: string | null
          event_end?: string | null
          event_location?: string | null
          event_start?: string | null
          event_subject?: string | null
          id?: string
          last_synced_at?: string | null
          lead_id: string
          outlook_event_id: string
        }
        Update: {
          attendee_emails?: string[] | null
          created_at?: string
          created_by?: string | null
          event_end?: string | null
          event_location?: string | null
          event_start?: string | null
          event_subject?: string | null
          id?: string
          last_synced_at?: string | null
          lead_id?: string
          outlook_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_calendar_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_history: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          lead_id: string
          metadata: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_participants: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          notify_enabled: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          notify_enabled?: boolean
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          notify_enabled?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_participants_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_owner_user_id: string | null
          company_id: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          department_id: string | null
          email: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          lead_ref_code: string | null
          next_action_date: string | null
          next_action_note: string | null
          next_action_type:
            | Database["public"]["Enums"]["lead_next_action_type"]
            | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          probability: number | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_owner_user_id?: string | null
          company_id?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_ref_code?: string | null
          next_action_date?: string | null
          next_action_note?: string | null
          next_action_type?:
            | Database["public"]["Enums"]["lead_next_action_type"]
            | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_owner_user_id?: string | null
          company_id?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_ref_code?: string | null
          next_action_date?: string | null
          next_action_note?: string | null
          next_action_type?:
            | Database["public"]["Enums"]["lead_next_action_type"]
            | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
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
          company_id: string | null
          content_hash: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
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
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
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
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
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
            foreignKeyName: "offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
      role_permissions: {
        Row: {
          allowed: boolean
          id: string
          permission_key: string
          role_id: string
        }
        Insert: {
          allowed?: boolean
          id?: string
          permission_key: string
          role_id: string
        }
        Update: {
          allowed?: boolean
          id?: string
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name?: string
        }
        Relationships: []
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
      user_memberships: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memberships_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          allowed: boolean
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
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
      can_access_record: {
        Args: {
          _record_company_id: string
          _record_created_by: string
          _record_department_id: string
          _record_id: string
          _user_id: string
        }
        Returns: boolean
      }
      check_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      claim_calendar_sync: {
        Args: {
          _job_id: string
          _lock_window_seconds?: number
          _operation_id: string
          _provider: string
          _technician_id: string
          _user_id: string
        }
        Returns: Json
      }
      get_user_scope: { Args: { _user_id: string }; Returns: string }
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
      lead_next_action_type:
        | "call"
        | "email"
        | "meeting"
        | "site_visit"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "befaring"
        | "qualified"
        | "tilbud_sendt"
        | "forhandling"
        | "lost"
        | "won"
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
      lead_next_action_type: [
        "call",
        "email",
        "meeting",
        "site_visit",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "befaring",
        "qualified",
        "tilbud_sendt",
        "forhandling",
        "lost",
        "won",
      ],
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
