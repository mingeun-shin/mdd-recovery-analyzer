import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Holds the publishable key, which is
 * designed to ship to browsers — every query it makes is gated by RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
