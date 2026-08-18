/**
 * Generated Supabase types.
 *
 * Do not edit by hand. Regenerate after every migration:
 *
 *   pnpm db:types
 *
 * Committed so CI and editors typecheck without a running database.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      companies: {
        Row: {
          address_line1: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          domain: string | null;
          id: string;
          import_job_id: string | null;
          industry: string | null;
          name: string;
          notes: string | null;
          organization_id: string;
          owner_id: string | null;
          phone: string | null;
          postal_code: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address_line1?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          domain?: string | null;
          id?: string;
          import_job_id?: string | null;
          industry?: string | null;
          name: string;
          notes?: string | null;
          organization_id: string;
          owner_id?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address_line1?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          domain?: string | null;
          id?: string;
          import_job_id?: string | null;
          industry?: string | null;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          owner_id?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "companies_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "companies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "companies_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          company_id: string | null;
          created_at: string;
          email: string | null;
          first_name: string | null;
          id: string;
          import_job_id: string | null;
          job_title: string | null;
          last_name: string | null;
          linkedin_url: string | null;
          notes: string | null;
          organization_id: string;
          owner_id: string | null;
          phone: string | null;
          source: Database["public"]["Enums"]["contact_source"];
          updated_at: string;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          import_job_id?: string | null;
          job_title?: string | null;
          last_name?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          organization_id: string;
          owner_id?: string | null;
          phone?: string | null;
          source?: Database["public"]["Enums"]["contact_source"];
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          import_job_id?: string | null;
          job_title?: string | null;
          last_name?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          organization_id?: string;
          owner_id?: string | null;
          phone?: string | null;
          source?: Database["public"]["Enums"]["contact_source"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_company_same_org";
            columns: ["organization_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "contacts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_stage_history: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          deal_id: string;
          from_stage_id: string | null;
          id: number;
          organization_id: string;
          to_stage_id: string;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          deal_id: string;
          from_stage_id?: string | null;
          id?: never;
          organization_id: string;
          to_stage_id: string;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          deal_id?: string;
          from_stage_id?: string | null;
          id?: never;
          organization_id?: string;
          to_stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_to_stage_id_fkey";
            columns: ["to_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          closed_at: string | null;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          currency: string;
          expected_close_date: string | null;
          id: string;
          lost_reason: string | null;
          organization_id: string;
          owner_id: string | null;
          pipeline_id: string;
          position: number;
          stage_entered_at: string;
          stage_id: string;
          status: Database["public"]["Enums"]["deal_status"];
          title: string;
          updated_at: string;
          value_cents: number;
        };
        Insert: {
          closed_at?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          expected_close_date?: string | null;
          id?: string;
          lost_reason?: string | null;
          organization_id: string;
          owner_id?: string | null;
          pipeline_id: string;
          position?: number;
          stage_entered_at?: string;
          stage_id: string;
          status?: Database["public"]["Enums"]["deal_status"];
          title: string;
          updated_at?: string;
          value_cents?: number;
        };
        Update: {
          closed_at?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          expected_close_date?: string | null;
          id?: string;
          lost_reason?: string | null;
          organization_id?: string;
          owner_id?: string | null;
          pipeline_id?: string;
          position?: number;
          stage_entered_at?: string;
          stage_id?: string;
          status?: Database["public"]["Enums"]["deal_status"];
          title?: string;
          updated_at?: string;
          value_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deals_company_same_org";
            columns: ["organization_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "deals_contact_same_org";
            columns: ["organization_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "deals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_pipeline_same_org";
            columns: ["organization_id", "pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "deals_stage_same_pipeline";
            columns: ["organization_id", "pipeline_id", "stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["organization_id", "pipeline_id", "id"];
          },
        ];
      };
      health_check: {
        Row: {
          checked_at: string;
          ok: boolean;
        };
        Insert: {
          checked_at?: string;
          ok?: boolean;
        };
        Update: {
          checked_at?: string;
          ok?: boolean;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          completed_at: string | null;
          create_companies: boolean;
          created_at: string;
          created_by: string | null;
          created_count: number;
          duplicate_policy: Database["public"]["Enums"]["import_duplicate_policy"];
          error_count: number;
          errors: Json;
          filename: string;
          id: string;
          mapping: Json | null;
          organization_id: string;
          processed_rows: number;
          skipped_count: number;
          status: Database["public"]["Enums"]["import_status"];
          total_rows: number;
          updated_at: string;
          updated_count: number;
        };
        Insert: {
          completed_at?: string | null;
          create_companies?: boolean;
          created_at?: string;
          created_by?: string | null;
          created_count?: number;
          duplicate_policy?: Database["public"]["Enums"]["import_duplicate_policy"];
          error_count?: number;
          errors?: Json;
          filename: string;
          id?: string;
          mapping?: Json | null;
          organization_id: string;
          processed_rows?: number;
          skipped_count?: number;
          status?: Database["public"]["Enums"]["import_status"];
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
        };
        Update: {
          completed_at?: string | null;
          create_companies?: boolean;
          created_at?: string;
          created_by?: string | null;
          created_count?: number;
          duplicate_policy?: Database["public"]["Enums"]["import_duplicate_policy"];
          error_count?: number;
          errors?: Json;
          filename?: string;
          id?: string;
          mapping?: Json | null;
          organization_id?: string;
          processed_rows?: number;
          skipped_count?: number;
          status?: Database["public"]["Enums"]["import_status"];
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_profiles_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          locale: string;
          name: string;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          locale?: string;
          name: string;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          locale?: string;
          name?: string;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pipeline_stages: {
        Row: {
          created_at: string;
          id: string;
          is_lost: boolean;
          is_won: boolean;
          name: string;
          organization_id: string;
          pipeline_id: string;
          position: number;
          probability: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_lost?: boolean;
          is_won?: boolean;
          name: string;
          organization_id: string;
          pipeline_id: string;
          position: number;
          probability?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_lost?: boolean;
          is_won?: boolean;
          name?: string;
          organization_id?: string;
          pipeline_id?: string;
          position?: number;
          probability?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_same_org";
            columns: ["organization_id", "pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      pipelines: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipelines_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          default_organization_id: string | null;
          full_name: string | null;
          id: string;
          locale: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          default_organization_id?: string | null;
          full_name?: string | null;
          id: string;
          locale?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          default_organization_id?: string | null;
          full_name?: string | null;
          id?: string;
          locale?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_default_organization_id_fkey";
            columns: ["default_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      create_invitation: {
        Args: {
          p_email: string;
          p_organization_id: string;
          p_role?: Database["public"]["Enums"]["org_role"];
        };
        Returns: {
          invitation_id: string;
          token: string;
        }[];
      };
      create_import_job: {
        Args: {
          p_create_companies?: boolean;
          p_duplicate_policy?: Database["public"]["Enums"]["import_duplicate_policy"];
          p_filename: string;
          p_mapping?: Json;
          p_organization_id: string;
          p_total_rows: number;
        };
        Returns: string;
      };
      create_organization: {
        Args: {
          p_currency?: string;
          p_locale?: string;
          p_name: string;
          p_timezone?: string;
        };
        Returns: string;
      };
      finalize_import_job: {
        Args: {
          p_job_id: string;
          p_status: Database["public"]["Enums"]["import_status"];
        };
        Returns: undefined;
      };
      hash_invitation_token: { Args: { p_token: string }; Returns: string };
      import_contacts_chunk: {
        Args: { p_job_id: string; p_rows: Json };
        Returns: Json;
      };
      is_org_admin: { Args: { org: string }; Returns: boolean };
      is_org_member: { Args: { org: string }; Returns: boolean };
      is_org_owner: { Args: { org: string }; Returns: boolean };
      my_admin_organization_ids: { Args: never; Returns: string[] };
      my_organization_ids: { Args: never; Returns: string[] };
      my_owner_organization_ids: { Args: never; Returns: string[] };
      org_role_of: {
        Args: { org: string };
        Returns: Database["public"]["Enums"]["org_role"];
      };
      pipeline_board: {
        Args: {
          p_cards_per_stage?: number;
          p_owner_id?: string;
          p_pipeline_id: string;
          p_query?: string;
        };
        Returns: Json;
      };
      preview_import_duplicates: {
        Args: {
          p_emails?: string[];
          p_organization_id: string;
          p_phones?: string[];
        };
        Returns: Json;
      };
      preview_invitation: {
        Args: { p_token: string };
        Returns: {
          email: string;
          organization_name: string;
          role: Database["public"]["Enums"]["org_role"];
        }[];
      };
      seed_default_pipeline: {
        Args: { p_name: string; p_organization_id: string; p_stages: Json };
        Returns: string;
      };
      shares_organization_with: {
        Args: { target_user: string };
        Returns: boolean;
      };
      slugify: { Args: { value: string }; Returns: string };
      undo_import_job: { Args: { p_job_id: string }; Returns: Json };
    };
    Enums: {
      contact_source: "manual" | "csv" | "api";
      deal_status: "open" | "won" | "lost";
      import_duplicate_policy: "skip" | "update" | "create";
      import_status: "pending" | "running" | "completed" | "failed" | "cancelled" | "rolled_back";
      org_role: "owner" | "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      contact_source: ["manual", "csv", "api"],
      deal_status: ["open", "won", "lost"],
      import_duplicate_policy: ["skip", "update", "create"],
      import_status: ["pending", "running", "completed", "failed", "cancelled", "rolled_back"],
      org_role: ["owner", "admin", "member"],
    },
  },
} as const;
