export const APP_ROUTES = {
  TODAY: 'today',
  FLOWS: 'flows',
  CONSTELLATIONS: 'constellations',
  ECHOES: 'echoes',
  PRIVACY: 'privacy',
} as const;

export type AppRouteKey = keyof typeof APP_ROUTES;
export type AppPage = (typeof APP_ROUTES)[AppRouteKey];

export const NAVIGATION_ORDER: AppPage[] = [
  APP_ROUTES.TODAY,
  APP_ROUTES.FLOWS,
  APP_ROUTES.CONSTELLATIONS,
  APP_ROUTES.ECHOES,
];
