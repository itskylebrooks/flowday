import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { webEnsureProfile } from '../lib/webSync';

export default function AuthCallback() {
  const [error, setError] = useState(false);

  useEffect(() => {
      (async () => {
        const url = new URL(window.location.href);
        const tokenHash = url.searchParams.get('token_hash');

      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
        if (error || !data.session) return setError(true);
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return setError(true);
      }

      try { await webEnsureProfile(); } catch { /* ignore */ }

      const redirect = localStorage.getItem('flowday_post_auth') || '/';
      localStorage.removeItem('flowday_post_auth');
      window.location.replace(redirect);
    })();
  }, []);

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-white/80">
        <p className="mb-4">Link expired or invalid.</p>
        <button
          type="button"
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 ring-1 ring-white/10 hover:bg-white/10"
          onClick={() => { window.location.href = '/'; }}
        >
          Send a new link
        </button>
      </div>
    );
  }

  return <div className="p-6 text-center text-sm text-white/80">Completing sign in…</div>;
}
