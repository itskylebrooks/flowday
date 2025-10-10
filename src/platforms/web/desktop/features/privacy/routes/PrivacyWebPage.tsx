// Privacy (Open Web)
// Applies to the web build with local-only storage + export/import. No accounts, no server sync, no analytics.

export default function PrivacyWebPage({ onBack }: { onBack?: () => void }) {
  return (
    <div className="mx-auto max-w-sm px-4 text-white h-full flex flex-col">
      <div className="flex items-center justify-between py-3">
        <h1 className="text-lg font-semibold">Flowday Privacy Policy (Web)</h1>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md bg-white/6 text-white/90 ring-1 ring-white/10 hover:bg-white/10"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="mt-2 flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="px-0 py-2 space-y-4 text-sm text-white/70" style={{ textAlign: 'justify' }}>
          <div><div className="font-semibold">Last updated: Feb 17, 2025</div></div>

          <div>
            <div className="font-semibold">What we collect</div>
            <ul className="list-disc pl-5 mt-2">
              <li><span className="font-medium">No account, no server:</span> The web build does not use login or cloud sync. We do not store your data on our servers.</li>
              <li><span className="font-medium">Local device data only:</span> Your mood entries (emojis, optional colors, optional song title/artist), recent emoji list, and basic preferences (e.g., UI settings) are saved in your browser’s local storage.</li>
              <li><span className="font-medium">No analytics:</span> We do not run analytics or tracking on the open web build.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">How we use data</div>
            <ul className="list-disc pl-5 mt-2">
              <li>All data stays on your device and is used only to show your entries and preferences.</li>
              <li>Nothing is sent to our servers unless you explicitly export and share the file yourself.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Sharing</div>
            <div className="mt-2">
              We do not sell or share your data. Because the web build is local-only, there is nothing for us to access on our side.
            </div>
          </div>

          <div>
            <div className="font-semibold">Your choices</div>
            <ul className="list-disc pl-5 mt-2">
              <li>Export your entries to a JSON file and import them later or on another browser.</li>
              <li>Clear local data in Settings if you want to wipe everything from this device.</li>
              <li>Using Flowday in Telegram? That version also keeps everything local and provides the same manual JSON export/import tools.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Contact</div>
            <div className="mt-2">
              Questions or requests: <a className="text-blue-500" href="https://t.me/itskylebrooks" target="_blank" rel="noreferrer">@itskylebrooks</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
