import { loadUser } from '@shared/lib/services/storage';
import type { Entry } from '@shared/lib/types/global';
import { todayISO } from '@shared/lib/utils';
import { MonthFlow, WeekTimeline } from '@shared/ui';

export default function FlowsPage({ recent7, monthHues, monthEmpty, mode, animKey }:
  { recent7: Entry[]; monthHues: number[]; monthEmpty: boolean; mode: 'week' | 'month'; animKey: string }) {

  const user = loadUser();
  function formatToday(): string {
    const iso = todayISO();
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="flex h-full flex-col gap-8">
      <div className="text-sm uppercase tracking-[0.4em] text-white/45">Flow posters</div>
      <div className="flex flex-col items-center gap-6 select-none">
        <div className="poster-meta active mb-1">
          <div className="text-center poster-label text-[30px] leading-[1.05] text-white/95">{formatToday()}</div>
          <div className="mt-1 text-center poster-sub text-white/70 tracking-wider">My flowday</div>
        </div>
        <div className="relative w-full max-w-5xl">
          <div key={animKey + '-' + mode} className="flow-anim flex items-center justify-center">
            {mode === 'week' ? (
              <WeekTimeline entries={recent7} />
            ) : (
              <MonthFlow hues={monthHues} empty={monthEmpty} />
            )}
          </div>
        </div>
        <div className="poster-meta active">
          <div className={(mode==='week' ? 'mt-6' : 'mt-2') + ' text-center poster-label text-[22px] leading-[1.05] text-white/80'}>
            @{user.username}
          </div>
        </div>
      </div>
    </div>
  );
}
