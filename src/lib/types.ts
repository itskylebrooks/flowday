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

export type Page = 'today' | 'flows' | 'constellations' | 'echoes';

// Basic user profile (local-only for now; future backend can extend)
export interface UserProfile {
  username: string; // display / handle
  createdAt: number;
  updatedAt: number;
}