# Changelog

## Unreleased
### Added
- PLAN.md outlining target structure, tooling, and QA strategy.
- ESLint flat config, Prettier settings, and EditorConfig for consistent formatting.
- Custom hooks `useTelegramEnvironment` and `useEntriesState` to encapsulate cross-cutting app state.
- Scoped Prettier check script and path aliases for Vite/Vitest.

### Changed
- Moved application entry point to `src/app/` and regrouped feature pages under `src/features/`.
- Updated shared components and tests to consume new alias-based imports.
- Tightened Constellations physics effect dependencies to avoid stale renders.
- Refined Telegram layout spacing logic and entry persistence via the new hooks.

### Removed
- Legacy `src/pages/*` structure superseded by feature directories.
