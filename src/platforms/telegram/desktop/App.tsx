import '@app/styles/index.css';
import { PlatformSplash } from '@shared/ui';

export default function App() {
  return (
    <PlatformSplash
      tag="Telegram · Desktop"
      accentClassName="text-indigo-300"
      title="Flowday for Telegram Desktop"
      description="Built for widescreen Telegram windows with keyboard shortcuts and focused panels."
      features={[
        {
          title: 'Keyboard friendly',
          description: 'Navigate entries with arrow keys and press Enter to open the emoji palette.',
        },
        {
          title: 'Split-pane layout',
          description: 'Keep your timeline visible while editing today’s journal entry side-by-side.',
        },
        {
          title: 'Presence aware',
          description: 'Syncs quickly with the mobile apps so your mood stays current across devices.',
        },
      ]}
      footer="Press Esc to close Flowday and return to your chat."
    />
  );
}
