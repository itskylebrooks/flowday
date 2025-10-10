import '@app/styles/index.css';
import { PlatformSplash } from '@shared/ui';

export default function App() {
  return (
    <PlatformSplash
      tag="Mobile Web"
      accentClassName="text-emerald-300"
      title="Flowday, pocket edition"
      description="Capture how you feel in a layout tuned for thumbs, quick swipes and narrow viewports."
      features={[
        {
          title: 'Comfort-first controls',
          description: 'Big tap targets and simplified cards keep journaling effortless on small screens.',
        },
        {
          title: 'Quick mood streaks',
          description: 'See your recent vibe streak in a compact timeline built for portrait orientation.',
        },
        {
          title: 'Offline friendly',
          description: 'Entries are cached locally so you can add feelings even when you drop signal.',
        },
      ]}
      footer="Swipe up from the toolbar to sync with Telegram or desktop at any time."
    />
  );
}
