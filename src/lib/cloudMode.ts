export type CloudMode = 'telegram' | 'email' | 'none';

export function detectCloudMode({ inTelegram, emailSession }: { inTelegram: boolean; emailSession: boolean }): CloudMode {
  if (inTelegram) return 'telegram';
  if (emailSession) return 'email';
  return 'none';
}
