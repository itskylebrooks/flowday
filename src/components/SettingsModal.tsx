import { APP_VERSION_LABEL } from '../lib/version';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-[#111] p-5 ring-1 ring-white/10 sm:rounded-2xl"
           onClick={(e)=>e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-2 right-2 rounded-full p-2 text-white/60 hover:text-white" aria-label="Close settings">
          <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div className="mb-4 text-center">
          <div className="text-lg font-semibold tracking-wide bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Settings
          </div>
        </div>

        <div className="divide-y divide-white/10">
          <div className="py-3">
            <div className="text-sm font-medium">Account</div>
            <div className="text-xs text-white/60">Coming soon: sign in, sync, delete data</div>
          </div>
          <div className="py-3">
            <div className="text-sm font-medium">Memories</div>
            <div className="text-xs text-white/60">Export monthly/weekly/yearly posters</div>
          </div>
          <div className="py-3">
            <div className="text-sm font-medium">Reminders</div>
            <div className="text-xs text-white/60">Daily reminder time, weekly recap</div>
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <button onClick={onClose} className="rounded-md px-4 py-1.5 text-sm font-medium text-white/85 ring-1 ring-white/15 hover:bg-white/5">Done</button>
        </div>
        <div className="mt-6 text-center text-[10px] leading-relaxed text-white/45">
          <div className="font-medium text-white/55">{APP_VERSION_LABEL}</div>
          <div className="mt-1">© {new Date().getFullYear()} Kyle Brooks. All rights reserved.</div>
          <div className="mt-0.5">Icons by Remix Design.</div>
        </div>
      </div>
    </div>
  );
}