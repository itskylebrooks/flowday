import { useMemo } from 'react';
import { motion } from 'motion/react';
import { auraBackground } from '@shared/lib/utils';

type AuraBlockVariant = 'compact' | 'expanded';

export default function AuraBlock({ emojis, hue, variant = 'expanded' }: { emojis: string[]; hue: number; variant?: AuraBlockVariant }) {
  const isCompact = variant === 'compact';
  const size = isCompact ? 224 : 260;
  const cx = size / 2;
  const cy = size / 2;
  const R = isCompact ? 70 : 92;

  const positions = useMemo(() => {
    const n = Math.max(1, Math.min(3, emojis.length));
    const baseAngles: number[] = [];
    if (n === 1) baseAngles.push(-90);
    if (n === 2) baseAngles.push(-90, 90);
    if (n === 3) baseAngles.push(-90, 30, 150);
    return baseAngles.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
    });
  }, [emojis.length, cx, cy]);

  const ROTATE_DURATION = 11; // seconds 

  return (
    <div className="mx-auto mt-2 flex flex-col items-center">
      <div
        className={isCompact ? 'relative h-56 w-56 rounded-full ring-1 ring-white/10' : 'relative h-64 w-64 rounded-full ring-1 ring-white/10'}
        style={auraBackground(hue)}
      >
        {/* key ensures the rotating container remounts when emojis change, so animation starts from 0 */}
        <motion.div
          key={`${emojis.join(',')}`}
          className="absolute inset-0"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: ROTATE_DURATION, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '50% 50%' }}
        >
          {positions.map((p, i) => (
            <div
              key={(emojis[i] || '_') + i}
              className="absolute"
              style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}
            >
              {/* Counter-rotate each emoji so it stays upright; initialize at 0 to avoid desync */}
              <motion.div
                initial={{ rotate: 0 }}
                animate={{ rotate: -360 }}
                transition={{ duration: ROTATE_DURATION, repeat: Infinity, ease: 'linear' }}
                className="text-3xl drop-shadow-[0_0_6px_rgba(255,255,255,0.35)] select-none"
                style={{ transformOrigin: '50% 50%' }}
              >
                {emojis[i] || ''}
              </motion.div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}