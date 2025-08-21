// Build full emoji categories from unicode-emoji-json
// Falls back to a generic group if data is missing.

// The package exports an object keyed by emoji with metadata including `group` & `subgroup`.
// We type it loosely to avoid overfitting to package internals.
type EmojiInfo = {
  name?: string;
  group?: string;
  subgroup?: string;
  shortcodes?: string[] | Record<string, string[]>;
};

// Using default import as most versions export the mapping as default
// If this changes, adjust the import accordingly.
const emojiData = (await import('unicode-emoji-json')).default as Record<string, EmojiInfo>;

const GROUP_ORDER = [
  'Emotions',
  'People',
  'Nature',
  'Nutrition',
  'Travel',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
  'Other',
];

export function getEmojiCategories(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  const rename: Record<string,string> = {
    'Smileys & Emotion': 'Emotions',
    'People & Body': 'People',
    'Animals & Nature': 'Nature',
    'Food & Drink': 'Nutrition',
    'Travel & Places': "Travel"
  };

  for (const [emoji, info] of Object.entries(emojiData)) {
    const raw = info?.group || 'Other';
    const group = rename[raw] || raw;
    if (!groups[group]) groups[group] = [];
    groups[group].push(emoji);
  }

  // Sort emojis alphabetically within groups for reasonable predictability
  for (const key of Object.keys(groups)) groups[key].sort((a, b) => a.localeCompare(b));

  // Return in a stable order
  const ordered: Record<string, string[]> = {};
  for (const key of GROUP_ORDER) {
    if (groups[key]?.length) ordered[key] = groups[key];
  }
  // Append any unexpected groups
  for (const key of Object.keys(groups)) {
    if (!ordered[key]) ordered[key] = groups[key];
  }

  return ordered;
}

export function getAllEmojis(): string[] {
  return Object.keys(emojiData);
}

export function searchEmojis(query: string, limit = 200): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: Array<{ e: string; w: number }> = [];
  for (const [emoji, info] of Object.entries(emojiData)) {
    const name = (info.name || '').toLowerCase();
    const group = (info.group || '').toLowerCase();
    const subgroup = (info.subgroup || '').toLowerCase();
    let codes: string[] = [];
    if (Array.isArray((info as EmojiInfo).shortcodes)) {
      codes = ((info as EmojiInfo).shortcodes as string[]);
    } else if (typeof (info as EmojiInfo).shortcodes === 'object' && (info as EmojiInfo).shortcodes) {
      // Flatten platform-specific shortcodes
      codes = Object.values((info as EmojiInfo).shortcodes as Record<string, string[]>).flat();
    }
    const codeStr = codes.join(' ').toLowerCase();

    const hay = `${name} ${group} ${subgroup} ${codeStr}`;
    if (!hay) continue;
    if (hay.includes(q)) {
      // Weight: startsWith higher, then contains
      let weight = 0;
      if (name.startsWith(q)) weight += 3;
      if (codeStr.includes(q)) weight += 2;
      if (group.includes(q) || subgroup.includes(q)) weight += 1;
      results.push({ e: emoji, w: weight });
    }
  }

  results.sort((a, b) => b.w - a.w);
  return results.slice(0, limit).map(r => r.e);
}
