// Privacy (Telegram Mini App)
// Applies to the Telegram version with cloud sync + reminders.

export default function PrivacyTelegramPage({ onBack }: { onBack?: () => void }) {
  return (
    <div className="mx-auto max-w-sm px-4 text-white h-full flex flex-col">
      <div className="flex items-center justify-between py-3">
        <h1 className="text-lg font-semibold">Flowday Privacy Policy (Telegram)</h1>
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
          <div><div className="font-semibold">Last updated: Aug 25, 2025</div></div>

          <div>
            <div className="font-semibold">What we collect</div>
            <ul className="list-disc pl-5 mt-2">
              <li><span className="font-medium">Telegram account:</span> Your Telegram ID and username (if available) to create your cloud account and sync entries across Telegram devices.</li>
              <li><span className="font-medium">App data:</span> Your mood entries (emojis, optional colors, optional song title/artist) and reminder preferences.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">How we use data</div>
            <ul className="list-disc pl-5 mt-2">
              <li>Provide cloud sync for your entries within Telegram.</li>
              <li>Send optional daily reminders if you enable them.</li>
              <li>Keep your cloud data (entries, reminders, username) in sync across Telegram devices.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Sharing</div>
            <div className="mt-2">
              We do not sell or share your personal data with third parties. Data is stored on our Supabase backend.
            </div>
          </div>

          <div>
            <div className="font-semibold">Your choices</div>
            <ul className="list-disc pl-5 mt-2">
              <li>Turn reminders on/off any time in Settings.</li>
              <li>Delete your cloud account in Settings (removes synced entries and reminder settings from the server). Local data on your device stays until you remove it.</li>
              <li>Want a portable copy? Use the web build’s export to JSON (available on the open web version).</li>
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
