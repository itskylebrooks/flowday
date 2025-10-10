// Build an exhaustive emoji index from emojibase metadata so the picker
// can expose every character (base, ZWJ sequences, and skin tone variants).

type RawEmoji = {
  label: string;
  hexcode: string;
  emoji: string;
  group?: number;
  subgroup?: number;
  order?: number;
  tags?: string[];
  skins?: RawEmojiSkin[];
};

type RawEmojiSkin = {
  label: string;
  hexcode: string;
  emoji: string;
  group?: number;
  subgroup?: number;
  order?: number;
  tags?: string[];
};

type ShortcodeSource = Record<string, string | string[]>;

type EmojiMeta = {
  emoji: string;
  label: string;
  order: number;
  group: number;
  subgroupKey: string;
  keywords: string[];
  keywordSet: Set<string>;
  keywordBlob: string;
};

type CategoryRule = {
  name: string;
  includeGroups?: number[];
  includeSubgroups?: string[];
  excludeSubgroups?: string[];
  fallback?: boolean;
};

type EmojiMessages = {
  groups: Array<{ key: string; message: string; order: number }>;
  subgroups: Array<{ key: string; message: string; order: number }>;
};

const [rawEmojiData, messageData, shortcodeModules] = await Promise.all([
  import('emojibase-data/en/data.json'),
  import('emojibase-data/en/messages.json'),
  Promise.all([
    import('emojibase-data/en/shortcodes/cldr.json'),
    import('emojibase-data/en/shortcodes/emojibase.json'),
    import('emojibase-data/en/shortcodes/github.json'),
    import('emojibase-data/en/shortcodes/iamcal.json'),
    import('emojibase-data/en/shortcodes/joypixels.json'),
  ]),
]);

const emojiData = rawEmojiData.default as RawEmoji[];
const messages = messageData.default as EmojiMessages;
const shortcodeSources = shortcodeModules.map((mod) => mod.default as ShortcodeSource);

const subgroupKeyByOrder = new Map<number, string>();
const subgroupLabelByKey = new Map<string, string>();
for (const entry of messages.subgroups) {
  subgroupKeyByOrder.set(entry.order, entry.key);
  subgroupLabelByKey.set(entry.key, entry.message);
}

const groupLabelByOrder = new Map<number, string>();
for (const entry of messages.groups) groupLabelByOrder.set(entry.order, entry.message);

const shortcodesByHex = new Map<string, Set<string>>();

for (const source of shortcodeSources) {
  for (const [rawHex, value] of Object.entries(source)) {
    const hex = normalizeHex(rawHex);
    if (!hex) continue;
    if (!shortcodesByHex.has(hex)) shortcodesByHex.set(hex, new Set());
    const set = shortcodesByHex.get(hex)!;
    if (Array.isArray(value)) {
      for (const entry of value) addShortcodeVariants(entry, set);
    } else {
      addShortcodeVariants(value, set);
    }
  }
}

const EMOJI_INDEX: EmojiMeta[] = [];
const ALL_EMOJI_SET = new Set<string>();

for (const entry of emojiData) {
  pushEmojiMeta(entry, entry);
  for (const skin of entry.skins ?? []) pushEmojiMeta(skin, entry);
}

EMOJI_INDEX.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

const ALL_EMOJIS = EMOJI_INDEX.map((item) => item.emoji);

const CATEGORY_RULES: CategoryRule[] = [
  { name: 'Expressions & Emotion', includeGroups: [0] },
  { name: 'People & Gestures', includeGroups: [1], excludeSubgroups: ['body-parts'] },
  { name: 'Body & Skin Tones', includeGroups: [2], includeSubgroups: ['body-parts'] },
  {
    name: 'Animals',
    includeSubgroups: [
      'animal-mammal',
      'animal-bird',
      'animal-amphibian',
      'animal-reptile',
      'animal-marine',
      'animal-bug',
    ],
  },
  { name: 'Nature & Weather', includeSubgroups: ['plant-flower', 'plant-other', 'sky-weather'] },
  { name: 'Food & Drink', includeGroups: [4] },
  { name: 'Travel & Places', includeGroups: [5], excludeSubgroups: ['sky-weather'] },
  { name: 'Activities & Events', includeGroups: [6] },
  { name: 'Objects & Tech', includeGroups: [7] },
  { name: 'Symbols', includeGroups: [8] },
  { name: 'Flags', includeGroups: [9] },
  { name: 'Other', fallback: true },
];

const categoryBuckets = new Map<string, string[]>();
for (const rule of CATEGORY_RULES) categoryBuckets.set(rule.name, []);

for (const meta of EMOJI_INDEX) {
  for (const rule of CATEGORY_RULES) {
    if (!matchesRule(rule, meta)) continue;
    categoryBuckets.get(rule.name)!.push(meta.emoji);
    break;
  }
}

const CATEGORY_ENTRIES: Array<[string, string[]]> = [];
for (const rule of CATEGORY_RULES) {
  const list = categoryBuckets.get(rule.name) ?? [];
  if (rule.fallback && list.length === 0) continue;
  if (!rule.fallback && list.length === 0) continue;
  CATEGORY_ENTRIES.push([rule.name, list]);
}

export function getEmojiCategories(): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const [name, list] of CATEGORY_ENTRIES) record[name] = list.slice();
  return record;
}

export function getAllEmojis(): string[] {
  return ALL_EMOJIS.slice();
}

export function searchEmojis(query: string, limit = 200): string[] {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return [];

  const results: Array<{ emoji: string; weight: number; order: number }> = [];

  for (const meta of EMOJI_INDEX) {
    let total = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const score = scoreToken(meta, token);
      if (score <= 0) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (!matchedAll) continue;
    results.push({ emoji: meta.emoji, weight: total, order: meta.order });
  }

  results.sort((a, b) => b.weight - a.weight || a.order - b.order);

  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of results) {
    if (seen.has(item.emoji)) continue;
    seen.add(item.emoji);
    output.push(item.emoji);
    if (output.length >= limit) break;
  }

  return output;
}

function pushEmojiMeta(entry: RawEmoji | RawEmojiSkin, base: RawEmoji) {
  const group = typeof entry.group === 'number' ? entry.group : (typeof base.group === 'number' ? base.group : 0);
  const subgroup = typeof entry.subgroup === 'number' ? entry.subgroup : base.subgroup;
  const subgroupKey = getSubgroupKey(subgroup);
  const order = typeof entry.order === 'number' ? entry.order : (typeof base.order === 'number' ? base.order : Number.MAX_SAFE_INTEGER);
  const groupLabel = groupLabelByOrder.get(group) ?? '';
  const subgroupLabel = subgroupLabelByKey.get(subgroupKey) ?? '';
  const keywords = collectKeywords(entry, base, groupLabel, subgroupLabel);
  const keywordSet = new Set(keywords);

  const meta: EmojiMeta = {
    emoji: entry.emoji,
    label: entry.label || base.label,
    order,
    group,
    subgroupKey,
    keywords: Array.from(keywordSet),
    keywordSet,
    keywordBlob: ` ${Array.from(keywordSet).join(' ')} `,
  };

  EMOJI_INDEX.push(meta);
  ALL_EMOJI_SET.add(meta.emoji);
}

function collectKeywords(entry: RawEmoji | RawEmojiSkin, base: RawEmoji, groupLabel: string, subgroupLabel: string): string[] {
  const set = new Set<string>();

  set.add(entry.emoji);
  addVariants(base.label, set);
  addVariants(entry.label, set);
  addVariants(groupLabel, set);
  addVariants(subgroupLabel, set);

  for (const tag of base.tags ?? []) addVariants(tag, set);
  for (const tag of entry.tags ?? []) addVariants(tag, set);

  const relatedHex = new Set<string>([base.hexcode, entry.hexcode]);
  for (const hex of relatedHex) {
    if (!hex) continue;
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) continue;
    const codes = shortcodesByHex.get(normalizedHex);
    if (!codes) continue;
    for (const code of codes) addVariants(code, set);
  }

  return Array.from(set);
}

function addVariants(value: string | undefined, target: Set<string>) {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  target.add(lower);

  const replaced = lower.replace(/[:&_/.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (replaced) {
    target.add(replaced);
    const collapsed = replaced.replace(/\s+/g, '');
    if (collapsed) target.add(collapsed);
    for (const part of replaced.split(' ')) if (part) target.add(part);
  }

  const condensed = lower.replace(/[^a-z0-9]+/g, '');
  if (condensed) target.add(condensed);
}

function addShortcodeVariants(value: string | undefined, target: Set<string>) {
  if (!value) return;
  const cleaned = value.replace(/^:+|:+$/g, '').trim();
  if (!cleaned) return;
  target.add(cleaned.toLowerCase());
}

function normalizeHex(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const normalized = hex.toString().trim();
  if (!normalized) return undefined;
  return normalized.toUpperCase();
}

function getSubgroupKey(value: number | undefined): string {
  if (typeof value !== 'number') return 'other';
  return subgroupKeyByOrder.get(value) ?? 'other';
}

function matchesRule(rule: CategoryRule, meta: EmojiMeta): boolean {
  if (rule.fallback) return true;
  if (rule.includeSubgroups && rule.includeSubgroups.includes(meta.subgroupKey)) return true;
  if (rule.includeGroups && rule.includeGroups.includes(meta.group)) {
    if (rule.excludeSubgroups && rule.excludeSubgroups.includes(meta.subgroupKey)) return false;
    return true;
  }
  return false;
}

function tokenizeQuery(input: string): string[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return [];

  const tokens = new Set<string>();
  const baseWords = trimmed.split(/\s+/g);

  for (const word of baseWords) {
    if (!word) continue;
    const unwrapped = word.replace(/^:+|:+$/g, '');
    if (unwrapped) {
      tokens.add(unwrapped);
      for (const part of unwrapped.split(/[_-]+/g)) if (part) tokens.add(part);
      tokens.add(unwrapped.replace(/[_-]+/g, ''));
    }

    for (const char of Array.from(word)) if (ALL_EMOJI_SET.has(char)) tokens.add(char);
  }

  return Array.from(tokens);
}

function scoreToken(meta: EmojiMeta, token: string): number {
  if (!token) return 0;
  if (token === meta.emoji) return 120;
  if (meta.keywordSet.has(token)) return 60;

  let best = 0;
  for (const keyword of meta.keywords) {
    if (keyword === token) {
      best = Math.max(best, 55);
    } else if (keyword.startsWith(token)) {
      best = Math.max(best, 25 + Math.min(10, token.length));
    } else if (token.length > 1 && keyword.includes(token)) {
      best = Math.max(best, 10 + Math.min(8, token.length));
    }
  }

  if (!best && meta.keywordBlob.includes(` ${token} `)) best = 8;

  return best;
}
