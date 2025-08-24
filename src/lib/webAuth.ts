import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

const STORAGE_KEY = 'flowday_supabase_session_v1';

export async function initSessionFromStorage(): Promise<Session | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { access_token, refresh_token } = JSON.parse(raw);
    if (!access_token || !refresh_token) return null;
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) { clearStoredSession(); return null; }
    return data.session;
  } catch {
    return null;
  }
}

export function storeSession(session: Session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }));
  } catch { /* ignore */ }
}

export function clearStoredSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
