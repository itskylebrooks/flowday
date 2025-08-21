import React from 'react';

export default function IconButton({
  label, active, onClick, children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={
        'flex h-10 w-10 items-center justify-center rounded-full ' +
        (active ? 'text-white' : 'text-white/60 hover:text-white/90')
      }
    >
      {children}
    </button>
  );
}