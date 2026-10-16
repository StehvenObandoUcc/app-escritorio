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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_blocks: {
        Row: {
          ai_tool: string | null
          ai_usage_type: string | null
          app_name: string
          category: string
          created_at: string
          domain: string | null
          ended_at: string
          id: string
          started_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          ai_tool?: string | null
          ai_usage_type?: string | null
          app_name: string
          category: string
          created_at?: string
          domain?: string | null
          ended_at: string
          id: string
          started_at: string
          team_id: string
          user_id: string
        }
        Update: {
          ai_tool?: string | null
          ai_usage_type?: string | null
          app_name?: string
          category?: string
          created_at?: string
          domain?: string | null
          ended_at?: string
          id?: string
          started_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_blocks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      app_closures: {
        Row: {
          closed_at: string
          created_at: string
          id: string
          reopened_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          closed_at: string
          created_at?: string
          id: string
          reopened_at: string
          team_id: string
          user_id: string
        }
        Update: {
          closed_at?: string
          created_at?: string
          id?: string
          reopened_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_closures_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          target_user: string | null
          team_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target_user?: string | null
          team_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target_user?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_rules: {
        Row: {
          ai_tool: string | null
          category: string
          created_at: string
          created_by: string
          id: string
          match_type: string
          not_allowed: boolean
          pattern: string
          priority: number
          team_id: string
        }
        Insert: {
          ai_tool?: string | null
          category: string
          created_at?: string
          created_by: string
          id?: string
          match_type: string
          not_allowed?: boolean
          pattern: string
          priority: number
          team_id: string
        }
        Update: {
          ai_tool?: string | null
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          match_type?: string
          not_allowed?: boolean
          pattern?: string
          priority?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_rules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          code: string | null
          created_at: string
          email: string
          expires_at: string
          failed_attempts: number
          id: string
          invited_by: string | null
          responded_at: string | null
          role: string
          status: string
          team_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          email: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          invited_by?: string | null
          responded_at?: string | null
          role: string
          status?: string
          team_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          invited_by?: string | null
          responded_at?: string | null
          role?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          timezone: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          timezone?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          timezone?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          settings: Json
          team_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          settings?: Json
          team_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          settings?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          content_type: string
          created_at: string
          id: string
          name: string
          path: string
          review_id: string | null
          size: number
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          name: string
          path: string
          review_id?: string | null
          size: number
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          name?: string
          path?: string
          review_id?: string | null
          size?: number
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "task_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_collaborators: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_criteria: {
        Row: {
          id: string
          met: boolean
          position: number
          task_id: string
          text: string
        }
        Insert: {
          id?: string
          met?: boolean
          position: number
          task_id: string
          text: string
        }
        Update: {
          id?: string
          met?: boolean
          position?: number
          task_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_criteria_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor: string | null
          created_at: string
          details: Json
          id: number
          kind: string
          project_id: string
          task_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          details?: Json
          id?: never
          kind: string
          project_id: string
          task_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          details?: Json
          id?: never
          kind?: string
          project_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reviews: {
        Row: {
          answers: Json
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          links: string[]
          reviewer_id: string | null
          status: string
          submitted_by: string | null
          task_id: string
        }
        Insert: {
          answers?: Json
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          links?: string[]
          reviewer_id?: string | null
          status?: string
          submitted_by?: string | null
          task_id: string
        }
        Update: {
          answers?: Json
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          links?: string[]
          reviewer_id?: string | null
          status?: string
          submitted_by?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_can_manage: boolean
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string
          due_date: string | null
          estimate_minutes: number | null
          evidence: string[]
          id: string
          labels: string[]
          parent_id: string | null
          project_id: string
          started_at: string | null
          status: string
          team_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          assignee_can_manage?: boolean
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string
          due_date?: string | null
          estimate_minutes?: number | null
          evidence?: string[]
          id?: string
          labels?: string[]
          parent_id?: string | null
          project_id: string
          started_at?: string | null
          status?: string
          team_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          assignee_can_manage?: boolean
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          estimate_minutes?: number | null
          evidence?: string[]
          id?: string
          labels?: string[]
          parent_id?: string | null
          project_id?: string
          started_at?: string | null
          status?: string
          team_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          consent_at: string | null
          consent_version: string | null
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          consent_at?: string | null
          consent_version?: string | null
          joined_at?: string
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          consent_at?: string | null
          consent_version?: string | null
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          settings?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          created_at: string
          deleted_at: string | null
          ended_at: string | null
          id: string
          source: string
          started_at: string
          task_id: string | null
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id: string
          source: string
          started_at: string
          task_id?: string | null
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          source?: string
          started_at?: string
          task_id?: string | null
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_code: string; p_consent_version: string; p_id: string }
        Returns: string
      }
      add_task_attachment: {
        Args: {
          p_name: string
          p_path: string
          p_review?: string
          p_task: string
        }
        Returns: string
      }
      assert_assignee: {
        Args: { p_assignee: string; p_project: string }
        Returns: undefined
      }
      assert_delivery: {
        Args: {
          p_answers: Json
          p_criteria_met: string[]
          p_links: string[]
          p_task: string
        }
        Returns: undefined
      }
      assert_project_open: { Args: { p_project: string }; Returns: undefined }
      caller_email: { Args: never; Returns: string }
      can_manage_project: { Args: { p_project: string }; Returns: boolean }
      can_manage_task_people: { Args: { p_task: string }; Returns: boolean }
      can_read_evidence: { Args: { p_path: string }; Returns: boolean }
      can_see_project: { Args: { p_project: string }; Returns: boolean }
      can_upload_evidence: { Args: { p_path: string }; Returns: boolean }
      clean_labels: { Args: { p_labels: string[] }; Returns: string[] }
      complete_task: {
        Args: {
          p_answers: Json
          p_criteria_met?: string[]
          p_links?: string[]
          p_task: string
        }
        Returns: string
      }
      create_project: {
        Args: { p_name: string; p_team: string }
        Returns: string
      }
      create_task: {
        Args: {
          p_assignee?: string
          p_assignee_can_manage?: boolean
          p_collaborators?: string[]
          p_criteria?: string[]
          p_description?: string
          p_due_date?: string
          p_estimate_minutes?: number
          p_labels?: string[]
          p_parent?: string
          p_project: string
          p_status: string
          p_title: string
          p_type?: string
        }
        Returns: string
      }
      create_team: { Args: { p_name: string }; Returns: string }
      decline_invitation: { Args: { p_id: string }; Returns: undefined }
      delete_project: {
        Args: { p_confirm_name: string; p_project: string }
        Returns: undefined
      }
      delete_task: { Args: { p_task: string }; Returns: undefined }
      delivery_attachment_ids: {
        Args: { p_answers: Json; p_task: string }
        Returns: string[]
      }
      ensure_project_member: {
        Args: { p_project: string; p_user: string }
        Returns: undefined
      }
      evidence_catalog: { Args: never; Returns: Json }
      evidence_task: { Args: { p_path: string }; Returns: string }
      give_consent: {
        Args: { p_team: string; p_version: string }
        Returns: undefined
      }
      has_consent: { Args: { p_team: string }; Returns: boolean }
      has_team_role: {
        Args: { p_roles: string[]; p_team: string }
        Returns: boolean
      }
      invite_member: {
        Args: { p_email: string; p_role: string; p_team: string }
        Returns: {
          code: string
          id: string
        }[]
      }
      is_task_worker: { Args: { p_task: string }; Returns: boolean }
      leave_team: { Args: { p_team: string }; Returns: undefined }
      link_delivery_attachments: {
        Args: { p_answers: Json; p_review: string; p_task: string }
        Returns: undefined
      }
      log_task_event: {
        Args: { p_details: Json; p_kind: string; p_task: string }
        Returns: undefined
      }
      my_invitations: {
        Args: never
        Returns: {
          expires_at: string
          id: string
          invited_by_name: string
          role: string
          team_id: string
          team_name: string
        }[]
      }
      new_invitation_code: { Args: never; Returns: string }
      project_role: { Args: { p_project: string }; Returns: string }
      project_time_summary: {
        Args: { p_from: string; p_project: string; p_to: string }
        Returns: {
          seconds: number
          user_id: string
        }[]
      }
      remove_member: {
        Args: { p_team: string; p_user: string }
        Returns: undefined
      }
      remove_project_member: {
        Args: { p_project: string; p_user: string }
        Returns: undefined
      }
      review_task: {
        Args: { p_approve: boolean; p_comment?: string; p_review: string }
        Returns: undefined
      }
      review_template: { Args: { p_project: string }; Returns: Json }
      revoke_invitation: { Args: { p_id: string }; Returns: undefined }
      set_alert_policy: {
        Args: { p_enabled: boolean; p_repeat_minutes: number; p_team: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_role: string; p_team: string; p_user: string }
        Returns: undefined
      }
      set_project_archived: {
        Args: { p_archived: boolean; p_project: string }
        Returns: undefined
      }
      set_project_member: {
        Args: { p_project: string; p_role: string; p_user: string }
        Returns: undefined
      }
      set_review_template: {
        Args: { p_project: string; p_template: Json }
        Returns: undefined
      }
      set_task_collaborators: {
        Args: { p_task: string; p_users: string[] }
        Returns: undefined
      }
      set_task_criteria: {
        Args: { p_task: string; p_texts: string[] }
        Returns: undefined
      }
      set_task_evidence: {
        Args: { p_evidence: string[]; p_task: string }
        Returns: undefined
      }
      set_task_status: {
        Args: { p_status: string; p_task: string }
        Returns: undefined
      }
      set_team_policy: {
        Args: { p_allow_hidden_apps: boolean; p_team: string }
        Returns: undefined
      }
      shares_team_with: { Args: { p_user: string }; Returns: boolean }
      submit_for_review: {
        Args: {
          p_answers: Json
          p_criteria_met?: string[]
          p_links?: string[]
          p_reviewer?: string
          p_task: string
        }
        Returns: string
      }
      take_task: { Args: { p_task: string }; Returns: undefined }
      task_delivery_fields: { Args: { p_task: string }; Returns: Json }
      task_history: { Args: { p_task: string }; Returns: Json }
      task_project: { Args: { p_task: string }; Returns: string }
      task_seconds: { Args: { p_task: string }; Returns: number }
      task_tree_seconds: { Args: { p_task: string }; Returns: number }
      team_activity_summary: {
        Args: { p_from: string; p_team: string; p_to: string }
        Returns: {
          ai_tool: string
          app_name: string
          blocks: number
          category: string
          seconds: number
          user_id: string
        }[]
      }
      team_domain_summary: {
        Args: { p_from: string; p_team: string; p_to: string }
        Returns: {
          category: string
          domain: string
          seconds: number
          user_id: string
        }[]
      }
      team_role: { Args: { p_team: string }; Returns: string }
      team_time_summary: {
        Args: { p_from: string; p_team: string; p_to: string }
        Returns: {
          entries: number
          seconds: number
          user_id: string
        }[]
      }
      team_work: { Args: { p_team: string }; Returns: Json }
      update_task: {
        Args: {
          p_assignee?: string
          p_assignee_can_manage?: boolean
          p_description?: string
          p_due_date?: string
          p_estimate_minutes?: number
          p_labels?: string[]
          p_status: string
          p_task: string
          p_title: string
          p_type?: string
        }
        Returns: undefined
      }
      valid_labels: { Args: { p_labels: string[] }; Returns: boolean }
      write_audit: {
        Args: {
          p_action: string
          p_details: Json
          p_target: string
          p_team: string
        }
        Returns: undefined
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
