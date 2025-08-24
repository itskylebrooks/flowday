import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function readSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function sendMagicLink(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
  });
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function deleteAccount(userId: string) {
  try {
    await supabase.from('entries').delete().eq('auth_user_id', userId);
    await supabase.from('users').delete().eq('auth_user_id', userId);
  } catch {
    /* ignore */
  }
  await supabase.auth.signOut();
}

export function useResendTimer(initial = 60) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setInterval(() => {
      setSeconds(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds]);
  const start = () => setSeconds(initial);
  return { seconds, start };
}
