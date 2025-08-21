export interface Song {
  title?: string;
  artist?: string;
}

export interface Entry {
  date: string;      // YYYY-MM-DD
  emojis: string[];  // up to 3
  hue?: number;      // 0..360
  song?: Song;       // reserved for later
  updatedAt: number;
}

export type Page = 'today' | 'flows' | 'constellations';