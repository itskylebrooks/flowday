const DEFAULT_PLATFORM = 'web-desktop';

type BootstrapModule = { bootstrap: () => void | Promise<void> };

async function importPlatformBootstrap(platform: string): Promise<BootstrapModule> {
  switch (platform) {
    case 'web-desktop':
    case 'web/desktop':
    case 'web':
    default:
      return import('@platforms/web/desktop/bootstrap');
  }
}

export async function loadPlatformApp(): Promise<void> {
  const rawTarget = import.meta.env.VITE_PLATFORM;
  const targetPlatform = typeof rawTarget === 'string' && rawTarget.trim()
    ? rawTarget.toLowerCase()
    : DEFAULT_PLATFORM;
  const module = await importPlatformBootstrap(targetPlatform);
  await module.bootstrap();
}
