/** Supabase URL and publishable key, or undefined until the project is set up. */
export function getSupabaseEnv(): { url: string; key: string } | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : undefined;
}
