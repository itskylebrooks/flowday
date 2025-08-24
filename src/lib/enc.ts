const RAW_KEY = import.meta.env.VITE_ENC_KEY || import.meta.env.VITE_FLOWDAY_ENC_KEY || '';
let keyPromise: Promise<CryptoKey | null> | null = null;

async function getKey(): Promise<CryptoKey | null> {
  if (keyPromise) return keyPromise;
  if (!RAW_KEY) {
    keyPromise = Promise.resolve(null);
    return keyPromise;
  }
  keyPromise = crypto.subtle
    .importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(RAW_KEY)),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
    .catch(() => null);
  return keyPromise;
}

export function hasEnc(): boolean { return !!RAW_KEY; }

export async function encryptStr(plain: string): Promise<string> {
  const key = await getKey();
  if (!key) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plain);
  const buf = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const tag = buf.slice(buf.length - 16);
  const enc = buf.slice(0, buf.length - 16);
  const out = new Uint8Array(12 + 16 + enc.length);
  out.set(iv, 0);
  out.set(tag, 12);
  out.set(enc, 28);
  let b64 = '';
  out.forEach(b => { b64 += String.fromCharCode(b); });
  return 'v1:' + btoa(b64);
}

export async function decryptStr(enc: string): Promise<string> {
  const key = await getKey();
  if (!key) return enc;
  if (!enc.startsWith('v1:')) return enc;
  try {
    const raw = atob(enc.slice(3));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const iv = bytes.slice(0, 12);
    const tag = bytes.slice(12, 28);
    const data = bytes.slice(28);
    const cipher = new Uint8Array(data.length + 16);
    cipher.set(data, 0);
    cipher.set(tag, data.length);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch {
    return '';
  }
}
