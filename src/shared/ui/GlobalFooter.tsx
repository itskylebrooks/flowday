import type { HTMLAttributes } from 'react';

type GlobalFooterProps = {
  variant?: 'desktop' | 'stacked';
} & HTMLAttributes<HTMLElement>;

const links = [
  { href: 'https://itskylebrooks.vercel.app/imprint', label: 'Imprint' },
  { href: 'https://itskylebrooks.vercel.app/privacy', label: 'Privacy Policy' },
  { href: 'https://itskylebrooks.vercel.app/license', label: 'License' },
];

export default function GlobalFooter({ variant = 'desktop', className = '', ...rest }: GlobalFooterProps) {
  const isStacked = variant !== 'desktop';
  const containerClass = [
    'text-[11px] leading-relaxed text-white/55',
    isStacked ? 'space-y-2' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const linkClass = 'text-white/70 transition hover:text-white';

  if (isStacked) {
    return (
      <footer className={containerClass} {...rest}>
        <div>© 2025 Kyle Brooks. All rights reserved.</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className={linkClass}>
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    );
  }

  return (
    <footer className={containerClass} {...rest}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>© 2025 Kyle Brooks. All rights reserved.</div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className={linkClass}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
