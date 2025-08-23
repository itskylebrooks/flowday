import crypto from 'crypto';

// Simple AES-256-GCM based encryption helper (versioned) for at-rest obfuscation in DB.
// NOT intended for high security; key must be provided via ENC_KEY env var (any string).

const RAW_KEY = process.env.ENC_KEY || process.env.FLOWDAY_ENC_KEY || '';
let key: Buffer | null = null;
if (RAW_KEY) {
  key = crypto.createHash('sha256').update(RAW_KEY).digest(); // 32 bytes
}

export function hasEnc(): boolean { return !!key; }

export function encryptStr(plain: string): string {
  if (!key) return plain; // fallback (unencrypted) if no key provided
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'v1:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptStr(enc: string): string {
  if (!key) return enc;
  if (!enc.startsWith('v1:')) return enc; // treat as plaintext legacy
  try {
    const raw = Buffer.from(enc.slice(3), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key as Buffer, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return ''; // on failure return empty string to avoid leaking ciphertext
  }
}
