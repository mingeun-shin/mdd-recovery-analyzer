import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS, so it is only for trusted server-side
 * work — currently writing the shared quote cache, which anon deliberately
 * has no insert grant on.
 *
 * Note that service_role bypasses RLS but NOT table privileges; new tables
 * need an explicit grant (see supabase/migrations/0001_init.sql).
 *
 * The "server-only" import above turns an accidental client-side import into
 * a build error rather than a leaked secret key.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
