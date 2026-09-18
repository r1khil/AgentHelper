import { createClient } from "@supabase/supabase-js";

// Publishable-key client for the browser. Only used to push bytes to a signed upload URL, which needs no session,
// so it never persists or refreshes auth state (the cookie session from @supabase/ssr stays the source of truth).
export function createSupabaseBrowser() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
