import type { Entry } from '../lib/types';
import { hsl } from '../lib/utils';
import WaveRibbon from '../components/WaveRibbon';
import MonthlyMix from '../components/MonthlyMix';

export default function FlowsPage({ recent7, monthHues }: { recent7: Entry[]; monthHues: number[] }) {
  const weekColors = recent7.map((e)=> hsl(e.hue ?? 220));
  return (
    <div className="mx-auto max-w-sm px-4 pb-28">
      <div className="mt-4 text-center text-sm text-white/80">This week’s vibe</div>
      <WaveRibbon colors={weekColors} height={56} amplitude={22} className="mt-4" />
      <div className="mt-10 text-center text-sm text-white/80">This month in color</div>
      <MonthlyMix hues={monthHues} className="mt-4" />
      <div className="mt-6 flex justify-end">
        <button className="rounded-md px-3 py-1 text-sm text-white/90 ring-1 ring-white/15 hover:bg-white/5">Save as poster</button>
      </div>
    </div>
  );
}