import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from '../src/App';

// Minimal mock for localStorage
class LS {
  store: Record<string,string> = {};
  getItem(k:string){ return this.store[k] ?? null; }
  setItem(k:string,v:string){ this.store[k]=String(v); }
  removeItem(k:string){ delete this.store[k]; }
  clear(){ this.store={}; }
}

// Provide fake Date for stable today
function mockToday(date: string) {
  const [y,m,d] = date.split('-').map(n=>parseInt(n,10));
  vi.setSystemTime(new Date(y,m-1,d));
}

describe('App aura regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockToday('2025-08-22');
  // @ts-expect-error injecting mock localStorage
    global.localStorage = new LS();
  });

  it('does not show aura when there are no emojis (regression)', () => {
    render(<App />);
    // Initially should not have class aura-active
    const container = document.querySelector('.emoji-trans-container');
    expect(container?.className).not.toContain('aura-active');
  });
});
