import { useState } from 'react';
import { supabase } from '../lib/supabase';

const SITE_URL = import.meta.env.VITE_SITE_URL || window.location.origin;

export default function LoginPage(){
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle'|'sent'|'error'>('idle');
  const [loading, setLoading] = useState(false);

  async function handleSend(e: React.FormEvent){
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: SITE_URL }
    });
    if (error) {
      setStatus('error');
    } else {
      setStatus('sent');
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
      <h1 className="text-xl font-semibold mb-4">Flowday</h1>
      <form onSubmit={handleSend} className="w-full max-w-sm space-y-3">
        <input
          type="email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 rounded-md bg-white/10 text-sm outline-none ring-1 ring-white/20 focus:ring-white/40"
          disabled={loading || status==='sent'}
        />
        <button
          type="submit"
          disabled={loading || status==='sent'}
          className="w-full px-3 py-2 rounded-md bg-white/20 hover:bg-white/30 transition text-sm font-medium disabled:opacity-40"
        >
          Send Magic Link
        </button>
      </form>
      {status==='sent' && (
        <p className="mt-4 text-sm text-green-400">Check your inbox for the login link.</p>
      )}
      {status==='error' && (
        <p className="mt-4 text-sm text-red-400">Couldn't send link. Try again later.</p>
      )}
    </div>
  );
}
