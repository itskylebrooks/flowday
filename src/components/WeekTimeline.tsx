import type { Entry } from '../lib/types';
import { hsl, todayISO, addDays } from '../lib/utils';

export default function WeekTimeline({ entries }: { entries: Entry[] }) {
  const width = 320;
  const height = 84;
  const pad = 10;
  const trackY = 28;
  const trackH = 20; // thicker line
  const segmentW = (width - pad * 2) / 7;

  const labels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']; // Monday → Sunday

  // Build Monday→Sunday ISO dates for the current week
  // If caller provided a 7-day `entries` slice (recent7 from App), prefer those dates so
  // WeekTimeline aligns exactly with the data window (this fixes last-week navigation).
  // Otherwise fall back to computing the Monday->Sunday range for the current week.
  let weekISOs: string[];
  if (Array.isArray(entries) && entries.length === 7 && entries.every(e => typeof e.date === 'string')) {
    weekISOs = entries.map(e => e.date);
  } else {
    const today = new Date(todayISO() + 'T00:00:00');
    const dowSun0 = today.getDay(); // 0..6, 0=Sun
    const monOffset = (dowSun0 + 6) % 7; // distance back to Monday
    const mondayISO = addDays(todayISO(), -monOffset);
    weekISOs = Array.from({ length: 7 }, (_, i) => addDays(mondayISO, i));
  }

  // Map colors per day, default to gray when no hue selected
  const gray = 'hsl(0 0% 30%)';
  const byDate = new Map(entries.map((e) => [e.date, e] as const));
  const dayColors = weekISOs.map((iso) => {
    const e = byDate.get(iso);
    return typeof e?.hue === 'number' ? hsl(e.hue) : gray;
  });

  const hasHue = entries.some(e => typeof e.hue === 'number');
  if (!hasHue) {
    return (
      <div className="mx-auto w-[320px] flex items-center justify-center select-none" style={{ height: 200 }}>
        <div className="text-white/18 font-poster" style={{ fontSize: 170, lineHeight: 1 }} aria-label="No data yet">?</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-[320px]">
      <svg
        className="mt-2 block"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        shapeRendering="geometricPrecision"
      >
        {/* Base track */}
        <rect x={pad} y={trackY} width={width - pad * 2} height={trackH} rx={trackH / 2} fill="white" opacity={0.08} />

        {/* Continuous gradient across Monday→Sunday with smooth transitions */}
        <linearGradient id="wkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          {/* Edge stops */}
          <stop offset="0%" stopColor={dayColors[0]} />
          {/* Center stops per day for smoother blending */}
          {dayColors.map((c, i) => (
            <stop key={i} offset={`${(((i + 0.5) / 7) * 100).toFixed(2)}%`} stopColor={c} />
          ))}
          <stop offset="100%" stopColor={dayColors[6]} />
        </linearGradient>
        <rect x={pad} y={trackY} width={width - pad * 2} height={trackH} rx={trackH / 2} fill="url(#wkGrad)" opacity={0.95} />

  {/* Removed top highlight to avoid gray line artifact under the band */}

        {/* Markers (dots) */}
        {labels.map((_, i) => (
          <circle key={i} cx={pad + i * segmentW + segmentW / 2} cy={trackY + trackH / 2} r={2} fill="white" opacity={0.6} />
        ))}

        {/* Labels */}
        {labels.map((lab, i) => (
          <text
            key={lab}
            x={pad + i * segmentW + segmentW / 2}
            y={trackY + trackH + 18}
            textAnchor="middle"
            className="fill-white/70"
            fontSize={10}
          >
            {lab}
          </text>
        ))}
      </svg>
    </div>
  );
}
