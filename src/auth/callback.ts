import { supabase } from '../lib/supabase';

async function finalize() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get('token_hash');
    if (tokenHash) {
      try {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      } catch {
        // ignore
      }
    }
  }
  window.location.replace('/');
}

finalize();
