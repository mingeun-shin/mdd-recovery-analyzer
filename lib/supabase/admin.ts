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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail at startup rather than per-request. Cache reads fall back to Yahoo
// on error, so a missing env var would otherwise look exactly like
// everything working — until Yahoo starts answering with 429s.
if (!url || !secretKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Set both in .env.local locally, and in the Vercel project settings for deploys."
  );
}

export const supabaseAdmin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
