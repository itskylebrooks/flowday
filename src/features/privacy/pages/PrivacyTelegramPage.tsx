// Privacy (Telegram Mini App)
// Applies to the Telegram version now running fully local within the Telegram WebApp container.

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
              <path
                d="M15 6L9 12L15 18"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="mt-2 flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="px-0 py-2 space-y-4 text-sm text-white/70" style={{ textAlign: 'justify' }}>
          <div>
            <div className="font-semibold">Last updated: Feb 17, 2025</div>
          </div>

          <div>
            <div className="font-semibold">What we collect</div>
            <ul className="list-disc pl-5 mt-2">
              <li>
                <span className="font-medium">Telegram basics only:</span> When you open the mini
                app we can read your Telegram ID and username so the UI can greet you. We do not
                store this information on our servers.
              </li>
              <li>
                <span className="font-medium">Local app data:</span> Your mood entries (emojis,
                optional colors, optional song title/artist) and preferences live inside the
                Telegram WebApp local storage on your device.
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">How we use data</div>
            <ul className="list-disc pl-5 mt-2">
              <li>
                Everything stays on your device. We render your flows, constellations, and echoes
                directly from local storage.
              </li>
              <li>
                If you export or share a poster, we temporarily send that poster to
                Telegram/Telegra.ph to deliver the share result you requested. We do not retain a
                copy.
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Sharing</div>
            <div className="mt-2">
              We do not sell or share your personal data with third parties. There is no Supabase or
              external database involved anymore.
            </div>
          </div>

          <div>
            <div className="font-semibold">Your choices</div>
            <ul className="list-disc pl-5 mt-2">
              <li>Export your data to JSON and import it on another device manually.</li>
              <li>
                Clear local data in Settings if you want to wipe everything from this Telegram
                client.
              </li>
              <li>Copy or paste JSON between Telegram devices using the built-in transfer card.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">Contact</div>
            <div className="mt-2">
              Questions or requests:{' '}
              <a
                className="text-blue-500"
                href="https://t.me/itskylebrooks"
                target="_blank"
                rel="noreferrer"
              >
                @itskylebrooks
              </a>
              .
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
