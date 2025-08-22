import React from 'react';

export default function IconButton({
  label, active, onClick, children, accent,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  accent?: string;
}) {
  const style: React.CSSProperties = {};
  if (accent) {
    if (active) {
      style.color = accent;
      style.textShadow = '0 0 6px ' + accent + '80';
    } else {
      style.color = 'rgba(255,255,255,0.55)';
    }
  }
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={
  'flex h-11 w-15 items-center justify-center rounded-full transition-colors ' +
        (accent ? (active ? '' : 'hover:text-white/90') : (active ? 'text-white' : 'text-white/60 hover:text-white/90'))
      }
      style={style}
    >
      {children}
    </button>
  );
}