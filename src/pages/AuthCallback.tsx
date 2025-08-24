import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { storeSession } from '../lib/webAuth';

export default function AuthCallback() {
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get('token_hash');
      let session = null;
      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
        if (!error) session = data.session; else setError(true);
      } else {
        const { data } = await supabase.auth.getSession();
        session = data.session; if (!session) setError(true);
      }
      if (session) {
        storeSession(session);
        const redirect = localStorage.getItem('flowday_post_auth') || '/';
        localStorage.removeItem('flowday_post_auth');
        window.location.replace(redirect);
      }
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
