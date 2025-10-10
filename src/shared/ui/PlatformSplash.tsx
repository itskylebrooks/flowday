import type { ReactNode } from 'react';

export type PlatformFeature = {
  title: string;
  description?: string;
};

interface PlatformSplashProps {
  tag: string;
  title: string;
  description: string;
  accentClassName?: string;
  features?: PlatformFeature[];
  footer?: ReactNode;
}

export function PlatformSplash({
  tag,
  title,
  description,
  accentClassName = 'text-sky-300',
  features,
  footer,
}: PlatformSplashProps) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className={`text-[11px] uppercase tracking-[0.35em] font-semibold ${accentClassName}`}>
          {tag}
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm leading-6 text-slate-300">{description}</p>
        {features && features.length > 0 ? (
          <ul className="text-left space-y-3">
            {features.map((feature) => (
              <li
                key={feature.title}
                className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 shadow-lg shadow-black/30 backdrop-blur"
              >
                <div className={`text-sm font-semibold ${accentClassName}`}>
                  {feature.title}
                </div>
                {feature.description ? (
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {feature.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {footer ? (
          <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default PlatformSplash;
