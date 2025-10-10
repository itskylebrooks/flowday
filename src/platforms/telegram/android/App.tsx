import '@app/styles/index.css';
import { PlatformSplash } from '@shared/ui';

export default function App() {
  return (
    <PlatformSplash
      tag="Telegram · Android"
      accentClassName="text-lime-300"
      title="Flowday for Telegram"
      description="Tailored for Telegram on Android with material accents and responsive panels."
      features={[
        {
          title: 'Adaptive layout',
          description: 'Toolbar actions scale for foldables and large-screen Telegram experiences.',
        },
        {
          title: 'System-aware colors',
          description: 'Adopts Telegram’s dynamic color hints for a native material look.',
        },
        {
          title: 'Fast composer access',
          description: 'Pin Flowday inside your attachment menu and start logging instantly.',
        },
      ]}
      footer="Works great with Telegram Premium themes too."
    />
  );
}
