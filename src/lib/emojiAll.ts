// Build full emoji categories from unicode-emoji-json
// Falls back to a generic group if data is missing.

// The package exports an object keyed by emoji with metadata including `group` & `subgroup`.
// We type it loosely to avoid overfitting to package internals.
type EmojiInfo = { group?: string; subgroup?: string };

// Using default import as most versions export the mapping as default
// If this changes, adjust the import accordingly.
const emojiData = (await import('unicode-emoji-json')).default as Record<string, EmojiInfo>;

const GROUP_ORDER = [
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
  'Other',
];

export function getEmojiCategories(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  for (const [emoji, info] of Object.entries(emojiData)) {
    const group = info?.group || 'Other';
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
