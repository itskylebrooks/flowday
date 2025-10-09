# Migration Notes

## Paths & imports
- App entry moved to `src/app/App.tsx`; update IDE run configs to point at `@app/App`.
- Feature pages relocated under `src/features/**`; adjust deep links or storybook stories that referenced `src/pages/*`.
- Use the new Vite/Vitest aliases (`@`, `@app`, `@features`, `@components`, `@lib`, `@types`) instead of long relative paths.

## State hooks
- Components that previously imported `loadEntries`/`saveEntries` directly should prefer the `useEntriesState` hook for consistency.
- Telegram-specific layout logic now lives in `useTelegramEnvironment(page)`; reuse this hook when building new Telegram-aware surfaces.

## Tooling
- ESLint now uses the flat config in `eslint.config.mjs`; ensure editors are configured to read it.
- Run formatting checks with `npm run format` (scoped to refactored files) before committing.
- Aliases are configured in both `vite.config.ts` and `vitest.config.ts`; update any custom tooling to mirror them.
