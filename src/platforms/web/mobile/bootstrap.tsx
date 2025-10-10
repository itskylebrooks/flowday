import App from '@platforms/web/desktop/App';
import { bootstrapReactApp } from '@app/bootstrapApp';

export function bootstrap(): void {
  bootstrapReactApp(App, 'web/mobile');
}
