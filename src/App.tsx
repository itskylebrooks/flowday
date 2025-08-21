import React, { useState } from 'react';
import type { Page } from './lib/types';
import { todayISO, addDays } from './lib/utils';
import IconButton from './components/IconButton';

export default function App() {
  const [page, setPage] = useState<Page>('today');
  const [activeDate, setActiveDate] = useState<string>(todayISO());

  function formatActiveDate(): string {
    const d = new Date(activeDate + 'T00:00:00');
    return d
      .toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' })
      .replace(',', ' ·');
  }

  return (
    <div className="w-full min-h-screen bg-[#0E0E0E] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 grid grid-cols-3 items-center px-3 py-3 text-sm text-white/90">
        <button
          aria-label="Go to yesterday"
          onClick={() => setActiveDate(addDays(activeDate, -1))}
          className="justify-self-start rounded-full p-2 text-white/70 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="justify-self-center font-medium">{formatActiveDate()}</div>
        <button
          aria-label="Open settings"
          onClick={() => {/* later */}}
          className="justify-self-end rounded-full p-2 text-white/70 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-3.5a7.5 7.5 0 0 1-.18 1.62l2.06 1.6-2 3.46-2.46-1a7.6 7.6 0 0 1-2.8 1.62l-.38 2.6H10.3l-.38-2.6a7.6 7.6 0 0 1-2.8-1.62l-2.46 1-2-3.46 2.06-1.6c.12.53.18 1.07.18 1.62Z" />
          </svg>
        </button>
      </div>

      {/* Pages (placeholders for now) */}
      {page === 'today' && (
        <div className="mx-auto max-w-sm px-4 pb-28">
          <div className="mt-10 text-center text-white/70">Today page (emoji picker comes next)</div>
        </div>
      )}
      {page === 'flows' && (
        <div className="mx-auto max-w-sm px-4 pb-28">
          <div className="mt-10 text-center text-white/70">Flows page (soon)</div>
        </div>
      )}
      {page === 'constellations' && (
        <div className="mx-auto max-w-sm px-4 pb-28">
          <div className="mt-10 text-center text-white/70">Constellations page (soon)</div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-sm items-center justify-between px-10 py-3 text-white/80">
          <IconButton label="Flows" active={page==='flows'} onClick={() => setPage('flows')}>
            <svg viewBox="0 0 24 24" className="h-6 w-6">
              <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M4 5h16M4 12h16M4 19h16" />
            </svg>
          </IconButton>

          <IconButton label="Today" active={page==='today'} onClick={() => { setActiveDate(todayISO()); setPage('today'); }}>
            <svg viewBox="0 0 24 24" className="h-6 w-6">
              <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M4.5 9.5l7.5-6 7.5 6v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
            </svg>
          </IconButton>

          <IconButton label="Constellations" active={page==='constellations'} onClick={() => setPage('constellations')}>
            <svg viewBox="0 0 24 24" className="h-6 w-6">
              <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M12 3l2.5 4.5L20 9l-4.5 2.5L12 16l-2.5-4.5L5 9l4.5-1.5z" />
            </svg>
          </IconButton>
        </div>
      </nav>
    </div>
  );
}