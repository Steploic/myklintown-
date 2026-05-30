/**
 * Types du schéma Postgres Supabase.
 *
 * Pour régénérer après une migration (une fois la base provisionnée) :
 * ```bash
 * pnpm --filter @myklintown/db gen-types
 * ```
 *
 * En attendant la génération automatique, les tables/vues sont typées de façon
 * permissive (les lectures sont castées côté appelant), tandis que les fonctions
 * RPC utilisées par l'app sont typées explicitement pour la sécurité des arguments.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      }
    >;
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: {
      create_signalement: {
        Args: {
          p_type: string;
          p_lat: number;
          p_lng: number;
          p_description?: string | null;
          p_photo_url?: string | null;
        };
        Returns: string;
      };
      create_incident_terrain: {
        Args: {
          p_type: string;
          p_lat?: number | null;
          p_lng?: number | null;
          p_description?: string | null;
          p_photo_url?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<string, string>;
    CompositeTypes: Record<string, unknown>;
  };
}
