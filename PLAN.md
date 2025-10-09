# Flowday Refactor Plan

## Target structure
```
src/
  app/
    App.tsx
    hooks/
      useEntriesState.ts
      useTelegramEnvironment.ts
  components/
    (shared UI primitives)
  features/
    constellations/
      components/ConstellationsPage.tsx
    echoes/
      components/EchoesPage.tsx
    flows/
      components/FlowsPage.tsx
    privacy/
      pages/PrivacyTelegramPage.tsx
      pages/PrivacyWebPage.tsx
  lib/
  types/
  assets/
  main.tsx
```

## Module boundaries
- **app**: bootstrapping, cross-feature hooks, layout scaffolding.
- **features**: domain-specific pages and UI logic grouped by product area.
- **components**: reusable primitives (modals, charts, inputs).
- **lib/services**: persistence, APIs, telemetry, platform utilities.
- **types**: shared TypeScript interfaces.

## Dependency cleanup
- Introduce flat ESLint config, Prettier, EditorConfig; drop legacy lint gaps.
- Add Vite/Vitest aliases (`@`, `@app`, `@features`, etc.) to replace brittle relative imports.
- Limit prettier checks to touched surface until legacy files can be reformatted incrementally.

## Risk areas & mitigation
- **Telegram integration**: encapsulate polling/back-button logic in `useTelegramEnvironment`, keep effect cleanup deterministic.
- **Entry persistence**: centralize load/save via `useEntriesState` to avoid divergence and ensure memoized defaults.
- **Routing mimicry**: maintain internal page state; ensure moves to `src/features` do not break dynamic imports.
- **Large canvases**: Constellations physics hook dependencies tightened to avoid runaway renders.

## Testing strategy
- Rewire Vitest to honor path aliases.
- Keep existing regression/unit tests passing; add smoke coverage for new hooks if regressions emerge.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` in CI; future follow-up: add playwright smoke for Telegram shell if practical.

## Performance & a11y
- Memoize Telegram environment offsets; avoid redundant DOM reads.
- Preserve lazy physics loops; evaluate bundle chunks via `vite build` output (watch `index-CzTzsda9.js`).
- Ensure modal buttons remain keyboard accessible after refactor; verify ARIA labels unaffected.
