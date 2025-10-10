import '@app/styles/index.css';
import { PlatformSplash } from '@shared/ui';

export default function App() {
  return (
    <PlatformSplash
      tag="Telegram · iOS"
      accentClassName="text-sky-300"
      title="Flowday for Telegram"
      description="Optimised for Telegram on iPhone with buttery gestures and native haptic cues."
      features={[
        {
          title: 'Inline mini app feel',
          description: 'Fits edge-to-edge with Telegram’s sheet presentation for a seamless journaling flow.',
        },
        {
          title: 'iOS haptics',
          description: 'Light taps confirm emoji picks and aura saves through the Telegram haptic bridge.',
        },
        {
          title: 'Auto-dark theming',
          description: 'Adapts colors based on the Telegram theme so Flowday always looks at home.',
        },
      ]}
      footer="Add Flowday to your chat menu for instant access."
    />
  );
}
