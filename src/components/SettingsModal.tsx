import { APP_VERSION_LABEL } from '../lib/version';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-[#111] p-4 ring-1 ring-white/10 sm:rounded-2xl"
           onClick={(e)=>e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-medium">Settings</div>
          <button onClick={onClose} className="rounded-full p-2 text-white/70 hover:text-white" aria-label="Close settings">
            <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

  <div className="mb-3 text-xs text-white/60">{APP_VERSION_LABEL}</div>

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

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-md px-3 py-1 text-sm text-white/80 ring-1 ring-white/15 hover:bg-white/5">Done</button>
        </div>
      </div>
    </div>
  );
}