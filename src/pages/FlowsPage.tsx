import type { Entry } from '../lib/types';
import WeekTimeline from '../components/WeekTimeline';
import MonthFlow from '../components/MonthFlow';

export default function FlowsPage({ recent7, monthHues, monthEmpty, mode, onToggleMode }:
  { recent7: Entry[]; monthHues: number[]; monthEmpty: boolean; mode: 'week' | 'month'; onToggleMode: () => void }) {

  return (
  <div className="mx-auto flex h-full max-w-sm flex-col px-4 pb-45 relative">
      {/* Title */}
      <div className="mt-4 text-center text-sm text-white/80">&nbsp;</div>

      {/* Visualization area */}
      <div className="mt-1 flex grow items-center justify-center relative">
        <div key={mode} className="flow-anim w-full flex items-center justify-center">
          {mode === 'week' ? (
            <WeekTimeline entries={recent7} />
          ) : (
            <MonthFlow hues={monthHues} empty={monthEmpty} />
          )}
        </div>
      </div>

      {/* Bottom actions */}
  <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          onClick={onToggleMode}
          className="rounded-md px-3 py-2 text-sm text-white/90 ring-1 ring-white/15 hover:bg-white/5"
        >
          {mode === 'week' ? 'Switch to month' : 'Switch to week'}
        </button>
        <button className="rounded-md px-3 py-2 text-sm text-white/90 ring-1 ring-white/15 hover:bg-white/5">Save as poster</button>
      </div>
    </div>
  );
}