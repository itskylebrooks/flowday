import { useEffect, useRef, useState } from 'react';
import { isTelegram, hapticFunny } from '../lib/telegram';
import { APP_VERSION } from '../lib/version';
import { APP_NAME } from '../lib/version';

interface Props {
  enabled?: boolean; // whether overlay functionality is enabled
  duration?: number; // haptic duration
  onCelebrate?: () => void; // callback after celebrate
}

export default function ReleaseOverlay({ enabled = true, duration = 2000, onCelebrate }: Props) {
  // Show overlay only when enabled AND the app version has changed since last seen
  // and the minor (middle) version digit is 0 or 5 (e.g. x.0.x or x.5.x).
  const LAST_VERSION_KEY = 'flowday_last_version';
  const [overlayMounted, setOverlayMounted] = useState<boolean>(() => {
    try {
      if (!enabled) return false;
      const last = localStorage.getItem(LAST_VERSION_KEY);
      if (last === APP_VERSION) return false; // already seen
      const parts = String(APP_VERSION).split('.');
      const minor = parts.length > 1 ? parseInt(parts[1] || '0', 10) : 0;
      if (Number.isNaN(minor)) return false;
      // show only when minor is 0 or 5 (multiples of 5)
      return minor % 5 === 0;
    } catch {
      return false;
    }
  });
  const [ghostVisible, setGhostVisible] = useState(false);
  const [ghostFading, setGhostFading] = useState(false);
  const [bannerGlow, setBannerGlow] = useState(false);
  const hapticRef = useRef(false);
  const toRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toRef.current) clearTimeout(toRef.current);
    };
  }, []);

  // If disabled, render nothing. Otherwise render the overlay button while mounted
  // and allow the ghost visual to render even after overlayMounted becomes false so
  // we can animate a smooth disappearing transition.
  if (!enabled) return null;
  if (!overlayMounted && !ghostVisible) return null;

  function handleClick() {
    if (hapticRef.current || ghostFading) return;
    setBannerGlow(true);
    hapticRef.current = true;
    try {
      if (isTelegram()) hapticFunny(duration); else if (navigator.vibrate) navigator.vibrate([100,50,200]);
    } catch { /* ignore */ }
  // Persist that user has seen/celebrated this version so it won't show again
  try { localStorage.setItem(LAST_VERSION_KEY, APP_VERSION); } catch { /* ignore */ }
    setOverlayMounted(false);
    setGhostVisible(true);
    setTimeout(() => setGhostFading(true), 20);
    toRef.current = window.setTimeout(() => {
      hapticRef.current = false;
      setBannerGlow(false);
      setGhostFading(false);
      setGhostVisible(false);
      if (onCelebrate) onCelebrate();
      toRef.current = null;
    }, 500);
  }

  return (
    <>
      {/* Render the interactive overlay while it's mounted */}
      {overlayMounted && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-auto">
          <button
            type="button"
            aria-label={`Celebrate ${APP_NAME} ${APP_VERSION}`}
            className="w-full h-8 rounded-full text-center text-white font-medium text-sm ring-1 focus:outline-none"
            onClick={handleClick}
            onMouseEnter={() => setBannerGlow(true)}
            onMouseLeave={() => { if (!hapticRef.current) setBannerGlow(false); }}
            style={{
              background: bannerGlow ? 'linear-gradient(90deg, rgba(50,170,110,0.36), rgba(255,205,130,0.36))' : 'linear-gradient(90deg, rgba(50,150,95,0.26), rgba(255,190,100,0.26))',
              border: bannerGlow ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
              boxShadow: bannerGlow ? '0 12px 40px rgba(255,190,100,0.18), 0 3px 8px rgba(50,170,110,0.06)' : '0 2px 10px rgba(0,0,0,0.22)'
            }}
          >
            {`🎉 ${APP_NAME} v${APP_VERSION} released! 🎉`}
          </button>
        </div>
      )}

      {/* Ghost visual: render even after overlayUnmount so fade animation can run */}
      {ghostVisible && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div aria-hidden className="w-full h-8 rounded-full" style={{
            background: ghostFading || bannerGlow ? 'linear-gradient(90deg, rgba(50,170,110,0.36), rgba(255,205,130,0.36))' : 'linear-gradient(90deg, rgba(50,150,95,0.26), rgba(255,190,100,0.26))',
            border: bannerGlow ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
            boxShadow: bannerGlow ? '0 12px 40px rgba(255,190,100,0.18), 0 3px 8px rgba(50,170,110,0.06)' : '0 2px 10px rgba(0,0,0,0.22)',
            opacity: ghostFading ? 0 : 1,
            transform: ghostFading ? 'scale(0.98)' : 'scale(1)',
            transition: 'opacity 420ms ease, transform 420ms ease, background 200ms ease'
          }} />
        </div>
      )}
    </>
  );
}
