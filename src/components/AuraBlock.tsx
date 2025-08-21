import { useMemo } from 'react';
import { motion } from 'motion/react'
import { auraBackground } from '../lib/utils';

export default function AuraBlock({ emojis, hue }: { emojis: string[]; hue: number }) {
  const size = 224, cx = size/2, cy = size/2, R = 70;

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
      <div className="relative h-56 w-56 rounded-full ring-1 ring-white/10" style={auraBackground(hue)}>
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: ROTATE_DURATION, repeat: Infinity, ease: 'linear' }}
        >
          {positions.map((p, i) => (
            <div
              key={(emojis[i] || '_') + i}
              className="absolute"
              style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}
            >
              {/* Counter-rotate each emoji so it stays upright */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: ROTATE_DURATION, repeat: Infinity, ease: 'linear' }}
                className="text-3xl drop-shadow-[0_0_6px_rgba(255,255,255,0.35)] select-none"
              >
                {emojis[i] || ''}
              </motion.div>
            </div>
          ))}
        </motion.div>
      </div>
      <div className="mt-2 text-xs text-white/60">Tap aura to edit emojis</div>
    </div>
  );
}