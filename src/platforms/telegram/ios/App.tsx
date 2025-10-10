import '@app/styles/index.css';

import DesktopApp from '@platforms/web/desktop/App';
import { useBodyClass } from '@shared/hooks/useBodyClass';
import { useBodyDataset } from '@shared/hooks/useBodyDataset';

export default function App() {
  useBodyClass('platform-telegram');
  useBodyClass('platform-telegram-ios');
  useBodyDataset('platform', 'telegram');
  useBodyDataset('telegramPlatform', 'ios');

  return <DesktopApp />;
}
