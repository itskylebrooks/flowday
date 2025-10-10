import '@app/styles/index.css';

import DesktopApp from '@platforms/web/desktop/App';
import { useBodyClass } from '@shared/hooks/useBodyClass';
import { useBodyDataset } from '@shared/hooks/useBodyDataset';

export default function App() {
  useBodyClass('platform-web');
  useBodyClass('platform-web-mobile');
  useBodyDataset('platform', 'web-mobile');

  return <DesktopApp />;
}
