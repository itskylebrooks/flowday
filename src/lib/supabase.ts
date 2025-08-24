import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'anon';
export const supabase = createClient(
  URL,
  KEY,
  // Persist sessions so email-auth users remain logged in across reloads
  { auth: { persistSession: true } }
);