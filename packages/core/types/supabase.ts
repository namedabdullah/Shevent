
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "bookings": {
                  Row: {
                    "amount_pkr": number,"created_at": string,"host_id": string,"id": string,"inquiry_id": string,"payment": string,"plan_id": string,"quote_id": string,"status": Database["public"]['Enums']["booking_status"],"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_pkr": number,"created_at"?: string,"host_id": string,"id"?: string,"inquiry_id": string,"payment"?: string,"plan_id": string,"quote_id": string,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_pkr"?: number,"created_at"?: string,"host_id"?: string,"id"?: string,"inquiry_id"?: string,"payment"?: string,"plan_id"?: string,"quote_id"?: string,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: true
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: true
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"inquiries": {
                  Row: {
                    "created_at": string,"host_id": string,"id": string,"plan_id": string,"status": Database["public"]['Enums']["inquiry_status"],"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"host_id"?: string,"id"?: string,"plan_id": string,"status"?: Database["public"]['Enums']["inquiry_status"],"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"host_id"?: string,"id"?: string,"plan_id"?: string,"status"?: Database["public"]['Enums']["inquiry_status"],"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inquiries_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inquiries_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "area": string | null,"category": Database["public"]['Enums']["service_category"] | null,"contact": string,"created_at": string,"id": string,"landing_path": string | null,"name": string | null,"referrer": string | null,"type": Database["public"]['Enums']["lead_type"],"utm_campaign": string | null,"utm_medium": string | null,"utm_source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area"?: string | null,"category"?: Database["public"]['Enums']["service_category"] | null,"contact": string,"created_at"?: string,"id"?: string,"landing_path"?: string | null,"name"?: string | null,"referrer"?: string | null,"type": Database["public"]['Enums']["lead_type"],"utm_campaign"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null
                  }
                  Update: {
                    "area"?: string | null,"category"?: Database["public"]['Enums']["service_category"] | null,"contact"?: string,"created_at"?: string,"id"?: string,"landing_path"?: string | null,"name"?: string | null,"referrer"?: string | null,"type"?: Database["public"]['Enums']["lead_type"],"utm_campaign"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"created_at": string,"id": number,"inquiry_id": string,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: never,"inquiry_id": string,"sender_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: never,"inquiry_id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_feedback": {
                  Row: {
                    "actual_spend_pkr": NonNullable<Json>,"created_at": string,"guest_count_actual": number | null,"plan_id": string,"rating": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_spend_pkr": NonNullable<Json>,"created_at"?: string,"guest_count_actual"?: number | null,"plan_id": string,"rating": number
                  }
                  Update: {
                    "actual_spend_pkr"?: NonNullable<Json>,"created_at"?: string,"guest_count_actual"?: number | null,"plan_id"?: string,"rating"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_feedback_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: true
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "area": Database["public"]['Enums']["lahore_area"],"created_at": string,"estimate": Json | null,"event_date": string,"event_type": Database["public"]['Enums']["event_type"],"guest_count": number,"id": string,"is_public": boolean,"owner_id": string,"preferences": (string)[],"share_id": string | null,"total_budget_pkr": number,"updated_at": string,"venue_type": Database["public"]['Enums']["venue_type"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area": Database["public"]['Enums']["lahore_area"],"created_at"?: string,"estimate"?: Json | null,"event_date": string,"event_type": Database["public"]['Enums']["event_type"],"guest_count": number,"id"?: string,"is_public"?: boolean,"owner_id"?: string,"preferences"?: (string)[],"share_id"?: string | null,"total_budget_pkr": number,"updated_at"?: string,"venue_type"?: Database["public"]['Enums']["venue_type"] | null
                  }
                  Update: {
                    "area"?: Database["public"]['Enums']["lahore_area"],"created_at"?: string,"estimate"?: Json | null,"event_date"?: string,"event_type"?: Database["public"]['Enums']["event_type"],"guest_count"?: number,"id"?: string,"is_public"?: boolean,"owner_id"?: string,"preferences"?: (string)[],"share_id"?: string | null,"total_budget_pkr"?: number,"updated_at"?: string,"venue_type"?: Database["public"]['Enums']["venue_type"] | null
                  }
                  Relationships: [
                    
                  ]
                },"portfolio_media": {
                  Row: {
                    "created_at": string,"duplicate_status": string | null,"id": string,"model_version": string | null,"phash": string | null,"status": Database["public"]['Enums']["media_status"],"storage_path": string,"tags": (string)[],"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"duplicate_status"?: string | null,"id"?: string,"model_version"?: string | null,"phash"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"storage_path": string,"tags"?: (string)[],"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"duplicate_status"?: string | null,"id"?: string,"model_version"?: string | null,"phash"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"storage_path"?: string,"tags"?: (string)[],"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "portfolio_media_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"id": string,"role": Database["public"]['Enums']["user_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    
                  ]
                },"quotes": {
                  Row: {
                    "amount_pkr": number,"created_at": string,"exclusions": (string)[],"hours": number | null,"id": string,"inclusions": (string)[],"inquiry_id": string,"notes": string | null,"total_pkr": number,"unit": Database["public"]['Enums']["price_unit"],"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_pkr": number,"created_at"?: string,"exclusions"?: (string)[],"hours"?: number | null,"id"?: string,"inclusions"?: (string)[],"inquiry_id": string,"notes"?: string | null,"total_pkr": number,"unit": Database["public"]['Enums']["price_unit"],"valid_until"?: string | null
                  }
                  Update: {
                    "amount_pkr"?: number,"created_at"?: string,"exclusions"?: (string)[],"hours"?: number | null,"id"?: string,"inclusions"?: (string)[],"inquiry_id"?: string,"notes"?: string | null,"total_pkr"?: number,"unit"?: Database["public"]['Enums']["price_unit"],"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "author_id": string | null,"body": string | null,"booking_id": string | null,"created_at": string,"id": string,"language": string | null,"rating": number,"source": Database["public"]['Enums']["review_source"],"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string | null,"booking_id"?: string | null,"created_at"?: string,"id"?: string,"language"?: string | null,"rating": number,"source"?: Database["public"]['Enums']["review_source"],"vendor_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string | null,"booking_id"?: string | null,"created_at"?: string,"id"?: string,"language"?: string | null,"rating"?: number,"source"?: Database["public"]['Enums']["review_source"],"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"sponsored_placements": {
                  Row: {
                    "area": Database["public"]['Enums']["lahore_area"],"category": Database["public"]['Enums']["service_category"],"created_at": string,"ends_at": string,"id": string,"starts_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area": Database["public"]['Enums']["lahore_area"],"category": Database["public"]['Enums']["service_category"],"created_at"?: string,"ends_at": string,"id"?: string,"starts_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "area"?: Database["public"]['Enums']["lahore_area"],"category"?: Database["public"]['Enums']["service_category"],"created_at"?: string,"ends_at"?: string,"id"?: string,"starts_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsored_placements_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendors": {
                  Row: {
                    "areas_served": (Database["public"]['Enums']["lahore_area"])[],"base_area": Database["public"]['Enums']["lahore_area"],"capacity_max": number | null,"capacity_min": number | null,"category": Database["public"]['Enums']["service_category"],"created_at": string,"description": string | null,"event_types": (Database["public"]['Enums']["event_type"])[],"id": string,"inclusions": (string)[],"is_demo": boolean,"name": string,"owner_id": string | null,"price_tier": Database["public"]['Enums']["price_tier"] | null,"public_consent": boolean,"slug": string,"sub_type": string | null,"updated_at": string,"verified": boolean,"years_active": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "areas_served"?: (Database["public"]['Enums']["lahore_area"])[],"base_area": Database["public"]['Enums']["lahore_area"],"capacity_max"?: number | null,"capacity_min"?: number | null,"category": Database["public"]['Enums']["service_category"],"created_at"?: string,"description"?: string | null,"event_types"?: (Database["public"]['Enums']["event_type"])[],"id"?: string,"inclusions"?: (string)[],"is_demo"?: boolean,"name": string,"owner_id"?: string | null,"price_tier"?: Database["public"]['Enums']["price_tier"] | null,"public_consent"?: boolean,"slug": string,"sub_type"?: string | null,"updated_at"?: string,"verified"?: boolean,"years_active"?: number | null
                  }
                  Update: {
                    "areas_served"?: (Database["public"]['Enums']["lahore_area"])[],"base_area"?: Database["public"]['Enums']["lahore_area"],"capacity_max"?: number | null,"capacity_min"?: number | null,"category"?: Database["public"]['Enums']["service_category"],"created_at"?: string,"description"?: string | null,"event_types"?: (Database["public"]['Enums']["event_type"])[],"id"?: string,"inclusions"?: (string)[],"is_demo"?: boolean,"name"?: string,"owner_id"?: string | null,"price_tier"?: Database["public"]['Enums']["price_tier"] | null,"public_consent"?: boolean,"slug"?: string,"sub_type"?: string | null,"updated_at"?: string,"verified"?: boolean,"years_active"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "vendor_stats": {
                  Row: {
                    "rating": number | null,"review_count": number | null,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "reviews_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "become_vendor":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"book_quote":
{ Args: { "target": string }; Returns: string
                           },
"get_shared_plan":
{ Args: { "token": string }; Returns: {
              "area": Database["public"]['Enums']["lahore_area"],"estimate": Json,"event_date": string,"event_type": Database["public"]['Enums']["event_type"],"guest_count": number,"total_budget_pkr": number,"venue_type": Database["public"]['Enums']["venue_type"]
            }[]
                           },
"inquiry_brief":
{ Args: { "target": string }; Returns: {
              "area": Database["public"]['Enums']["lahore_area"],"event_date": string,"event_type": Database["public"]['Enums']["event_type"],"guest_count": number,"preferences": (string)[],"venue_type": Database["public"]['Enums']["venue_type"]
            }[]
                           },
"share_plan":
{ Args: { "target": string }; Returns: string
                           },
"vendor_inbox":
{ Args: Record<PropertyKey, never>; Returns: {
              "area": Database["public"]['Enums']["lahore_area"],"created_at": string,"event_date": string,"event_type": Database["public"]['Enums']["event_type"],"guest_count": number,"inquiry_id": string,"quote_total_pkr": number,"status": Database["public"]['Enums']["inquiry_status"],"updated_at": string
            }[]
                           }
          }
          Enums: {
            "booking_status": "confirmed"|"cancelled"|"completed","event_type": "wedding_mehndi"|"wedding_baraat"|"wedding_walima"|"engagement"|"birthday"|"corporate_dinner"|"corporate_other"|"university_gala"|"concert"|"private_party","inquiry_status": "open"|"quoted"|"booked"|"declined"|"closed","lahore_area": "Gulberg"|"DHA"|"Johar Town"|"Cantt"|"Model Town"|"Raiwind Road"|"Bahria Town"|"Wapda Town"|"Garden Town"|"Faisal Town"|"Allama Iqbal Town"|"Township"|"Lake City"|"Valencia"|"Shadman"|"Other","lead_type": "waitlist"|"vendor_join","media_status": "pending"|"approved"|"flagged","price_tier": "budget"|"mid"|"premium","price_unit": "per_head"|"per_event"|"per_hour"|"per_package"|"per_slot"|"per_setup","review_source": "booking"|"imported","service_category": "venue"|"catering"|"decor"|"dj_sound"|"lighting"|"photography","user_role": "host"|"vendor"|"admin","venue_type": "marquee"|"banquet"|"farmhouse"|"rooftop"|"lawn"|"hotel"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "booking_status": ["confirmed", "cancelled", "completed"],"event_type": ["wedding_mehndi", "wedding_baraat", "wedding_walima", "engagement", "birthday", "corporate_dinner", "corporate_other", "university_gala", "concert", "private_party"],"inquiry_status": ["open", "quoted", "booked", "declined", "closed"],"lahore_area": ["Gulberg", "DHA", "Johar Town", "Cantt", "Model Town", "Raiwind Road", "Bahria Town", "Wapda Town", "Garden Town", "Faisal Town", "Allama Iqbal Town", "Township", "Lake City", "Valencia", "Shadman", "Other"],"lead_type": ["waitlist", "vendor_join"],"media_status": ["pending", "approved", "flagged"],"price_tier": ["budget", "mid", "premium"],"price_unit": ["per_head", "per_event", "per_hour", "per_package", "per_slot", "per_setup"],"review_source": ["booking", "imported"],"service_category": ["venue", "catering", "decor", "dj_sound", "lighting", "photography"],"user_role": ["host", "vendor", "admin"],"venue_type": ["marquee", "banquet", "farmhouse", "rooftop", "lawn", "hotel", "other"]
          }
        }
} as const
