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
      drivers: {
        Row: {
          assigned_vehicle_id: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          license_expiry: string | null
          license_number: string | null
          metadata: Json
          phone: string | null
          school_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_vehicle_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          license_expiry?: string | null
          license_number?: string | null
          metadata?: Json
          phone?: string | null
          school_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_vehicle_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          license_expiry?: string | null
          license_number?: string | null
          metadata?: Json
          phone?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          is_read: boolean
          school_id: string
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          school_id: string
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          school_id?: string
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          school_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          school_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qr_logs: {
        Row: {
          created_at: string
          driver_id: string | null
          event_type: string
          id: string
          location: Json | null
          scanned_at: string
          school_id: string
          student_id: string
          trip_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          event_type: string
          id?: string
          location?: Json | null
          scanned_at?: string
          school_id: string
          student_id: string
          trip_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          event_type?: string
          id?: string
          location?: Json | null
          scanned_at?: string
          school_id?: string
          student_id?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          description: string | null
          driver_id: string | null
          drop_start_time: string | null
          id: string
          is_active: boolean
          name: string
          pickup_start_time: string | null
          school_id: string
          stops: Json
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          driver_id?: string | null
          drop_start_time?: string | null
          id?: string
          is_active?: boolean
          name: string
          pickup_start_time?: string | null
          school_id: string
          stops?: Json
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          driver_id?: string | null
          drop_start_time?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pickup_start_time?: string | null
          school_id?: string
          stops?: Json
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          postal_code: string | null
          settings: Json
          slug: string
          state: string | null
          status: Database["public"]["Enums"]["school_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          settings?: Json
          slug: string
          state?: string | null
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          settings?: Json
          slug?: string
          state?: string | null
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      speed_logs: {
        Row: {
          driver_id: string | null
          id: string
          is_violation: boolean
          location: Json | null
          recorded_at: string
          school_id: string
          speed_kmh: number
          speed_limit_kmh: number | null
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          driver_id?: string | null
          id?: string
          is_violation?: boolean
          location?: Json | null
          recorded_at?: string
          school_id: string
          speed_kmh: number
          speed_limit_kmh?: number | null
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          driver_id?: string | null
          id?: string
          is_violation?: boolean
          location?: Json | null
          recorded_at?: string
          school_id?: string
          speed_kmh?: number
          speed_limit_kmh?: number | null
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "speed_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speed_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speed_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speed_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_number: string | null
          blood_group: string | null
          class_section: string | null
          created_at: string
          date_of_birth: string | null
          drop_address: string | null
          drop_lat: number | null
          drop_lng: number | null
          emergency_contact: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          grade: string | null
          id: string
          is_active: boolean
          last_name: string | null
          parent_email: string | null
          parent_id: string | null
          parent_name: string | null
          parent_phone: string | null
          photo_url: string | null
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          qr_code: string | null
          roll_number: string | null
          route_id: string | null
          school_id: string
          student_code: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          admission_number?: string | null
          blood_group?: string | null
          class_section?: string | null
          created_at?: string
          date_of_birth?: string | null
          drop_address?: string | null
          drop_lat?: number | null
          drop_lng?: number | null
          emergency_contact?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          parent_email?: string | null
          parent_id?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          qr_code?: string | null
          roll_number?: string | null
          route_id?: string | null
          school_id: string
          student_code?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          admission_number?: string | null
          blood_group?: string | null
          class_section?: string | null
          created_at?: string
          date_of_birth?: string | null
          drop_address?: string | null
          drop_lat?: number | null
          drop_lng?: number | null
          emergency_contact?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          parent_email?: string | null
          parent_id?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          qr_code?: string | null
          roll_number?: string | null
          route_id?: string | null
          school_id?: string
          student_code?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          action: string
          amount_cents: number
          created_at: string
          currency: string
          from_cycle: Database["public"]["Enums"]["billing_cycle"] | null
          from_plan: string | null
          id: string
          notes: string | null
          performed_by: string | null
          period_end: string | null
          period_start: string | null
          school_id: string
          subscription_id: string | null
          to_cycle: Database["public"]["Enums"]["billing_cycle"] | null
          to_plan: string | null
        }
        Insert: {
          action: string
          amount_cents?: number
          created_at?: string
          currency?: string
          from_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          from_plan?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          period_end?: string | null
          period_start?: string | null
          school_id: string
          subscription_id?: string | null
          to_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          to_plan?: string | null
        }
        Update: {
          action?: string
          amount_cents?: number
          created_at?: string
          currency?: string
          from_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          from_plan?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          period_end?: string | null
          period_start?: string | null
          school_id?: string
          subscription_id?: string | null
          to_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          to_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          code: string
          created_at: string
          currency: string
          duration_days: number | null
          features: Json
          id: string
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
          student_limit: number | null
          tier: string
          updated_at: string
          vehicle_limit: number | null
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          code: string
          created_at?: string
          currency?: string
          duration_days?: number | null
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          sort_order?: number
          student_limit?: number | null
          tier: string
          updated_at?: string
          vehicle_limit?: number | null
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          code?: string
          created_at?: string
          currency?: string
          duration_days?: number | null
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          student_limit?: number | null
          tier?: string
          updated_at?: string
          vehicle_limit?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount_cents: number
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          payment_status: Database["public"]["Enums"]["payment_status"]
          plan_id: string | null
          plan_name: string
          renewal_date: string | null
          school_id: string
          seats: number
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          payment_status?: Database["public"]["Enums"]["payment_status"]
          plan_id?: string | null
          plan_name?: string
          renewal_date?: string | null
          school_id: string
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          payment_status?: Database["public"]["Enums"]["payment_status"]
          plan_id?: string | null
          plan_name?: string
          renewal_date?: string | null
          school_id?: string
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          driver_id: string | null
          end_location: Json | null
          ended_at: string | null
          id: string
          metadata: Json
          route_id: string
          school_id: string
          start_location: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          trip_date: string
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          end_location?: Json | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          route_id: string
          school_id: string
          start_location?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          trip_date?: string
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          end_location?: Json | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          route_id?: string
          school_id?: string
          start_location?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          trip_date?: string
          trip_type?: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity: number
          color: string | null
          created_at: string
          fitness_expiry: string | null
          id: string
          insurance_expiry: string | null
          is_active: boolean
          metadata: Json
          model: string | null
          registration_number: string
          school_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          color?: string | null
          created_at?: string
          fitness_expiry?: string | null
          id?: string
          insurance_expiry?: string | null
          is_active?: boolean
          metadata?: Json
          model?: string | null
          registration_number: string
          school_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          color?: string | null
          created_at?: string
          fitness_expiry?: string | null
          id?: string
          insurance_expiry?: string | null
          is_active?: boolean
          metadata?: Json
          model?: string | null
          registration_number?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      is_school_admin_of: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      user_belongs_to_school: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "school_admin" | "driver" | "parent"
      billing_cycle: "trial" | "monthly" | "yearly"
      payment_status: "paid" | "pending" | "overdue"
      school_status: "active" | "suspended" | "pending"
      subscription_status:
        | "active"
        | "past_due"
        | "canceled"
        | "trialing"
        | "expired"
        | "suspended"
      trip_status: "scheduled" | "in_progress" | "completed" | "canceled"
      trip_type: "pickup" | "drop"
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
      app_role: ["super_admin", "school_admin", "driver", "parent"],
      billing_cycle: ["trial", "monthly", "yearly"],
      payment_status: ["paid", "pending", "overdue"],
      school_status: ["active", "suspended", "pending"],
      subscription_status: [
        "active",
        "past_due",
        "canceled",
        "trialing",
        "expired",
        "suspended",
      ],
      trip_status: ["scheduled", "in_progress", "completed", "canceled"],
      trip_type: ["pickup", "drop"],
    },
  },
} as const
