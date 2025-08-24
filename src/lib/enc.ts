const RAW_KEY = import.meta.env.VITE_ENC_KEY || '';
let keyPromise: Promise<CryptoKey | null> | null = null;

async function getKey(): Promise<CryptoKey | null> {
  if (!RAW_KEY) return null;
  if (!keyPromise) {
    keyPromise = (async () => {
      try {
        const enc = new TextEncoder().encode(RAW_KEY);
        const hash = await crypto.subtle.digest('SHA-256', enc);
        return await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
      } catch {
        return null;
      }
    })();
  }
  return keyPromise;
}

export async function encryptStr(plain: string): Promise<string> {
  const key = await getKey();
  if (!key) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const encBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const encBytes = new Uint8Array(encBuf);
  const tag = encBytes.slice(-16);
  const cipher = encBytes.slice(0, -16);
  const full = new Uint8Array(iv.length + tag.length + cipher.length);
  full.set(iv, 0);
  full.set(tag, iv.length);
  full.set(cipher, iv.length + tag.length);
  let b64 = '';
  for (const b of full) b64 += String.fromCharCode(b);
  return 'v1:' + btoa(b64);
}

export async function decryptStr(enc: string): Promise<string> {
  const key = await getKey();
  if (!key) return enc;
  if (!enc.startsWith('v1:')) return enc;
  try {
    const rawStr = atob(enc.slice(3));
    const raw = new Uint8Array(rawStr.length);
    for (let i = 0; i < rawStr.length; i++) raw[i] = rawStr.charCodeAt(i);
    const iv = raw.slice(0, 12);
    const tag = raw.slice(12, 28);
    const cipher = raw.slice(28);
    const encCombined = new Uint8Array(cipher.length + tag.length);
    encCombined.set(cipher, 0);
    encCombined.set(tag, cipher.length);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encCombined);
    return new TextDecoder().decode(dec);
  } catch {
    return '';
  }
}
