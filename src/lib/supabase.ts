import { createClient, SupabaseClient } from '@supabase/supabase-js';

// In tests or local non-configured environments the Supabase credentials may be
// absent. To keep the module safe to import, fall back to a dummy client when
// the environment variables are missing.
function makeClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const real = url && anon;
  return createClient(
    real ? url : 'https://example.com',
    real ? anon : 'public-anon-key',
    {
      auth: {
        // Persist the session so returning to the app keeps the user signed in
        // and allow the SDK to refresh tokens automatically in the background.
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
}

export const supabase = makeClient();