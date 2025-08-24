import { supabase } from './supabase';

// Track auth state for synchronous checks
let authed = false;

// Initialize auth state
supabase.auth.getSession().then(({ data }) => {
  authed = !!data.session;
});

// Listen for auth changes
supabase.auth.onAuthStateChange((_event, session) => {
  authed = !!session;
});

export function isEmailAuthed(): boolean {
  return authed;
}

export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  return { error };
}

export async function completeEmailSignIn(url: string = window.location.href) {
  const { error } = await supabase.auth.exchangeCodeForSession(url);
  if (!error) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try {
        await supabase.from('users').upsert(
          { auth_user_id: user.id, email: user.email },
          { onConflict: 'auth_user_id' }
        );
      } catch { /* ignore */ }
    }
  }
  return { error };
}

export async function signOutEmail() {
  await supabase.auth.signOut();
}

export async function deleteEmailAccount() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'not-authed' as const };
  try {
    const res = await fetch('/api/email-delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: 'delete-failed' as const };
    await supabase.auth.signOut();
    return { error: null };
  } catch {
    return { error: 'delete-failed' as const };
  }
}

export async function currentUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}
