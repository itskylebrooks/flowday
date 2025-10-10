import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

function ensureRootElement(): HTMLElement {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element with id "root" was not found.');
  }
  return root;
}

export function bootstrap(): void {
  const rootElement = ensureRootElement();
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
