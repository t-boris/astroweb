# @astroweb/chart-core

Pure natal chart code shared by the web app and the Cloud Functions: the data contract (`ChartResult` and friends),
constants, wheel geometry (`wheelLayout`, `chartMath`, `labelSpread`), position helpers and the framework-free parts of
the view-model. No runtime dependencies, no React, no i18n. Import everything from the barrel `src/index.ts`.

## How each consumer gets it

- **web** imports `@astroweb/chart-core` as an npm workspace package. Vite and `tsc` use the TypeScript sources directly.
- **functions** cannot import it that way: `firebase deploy` uploads the folder `functions/` only, so a package outside it
  is missing in Cloud Build. `scripts/vendor-chart-core.mjs` copies `src/` (without `__tests__`) to
  `functions/src/vendor/chart-core/` (git-ignored, generated). `npm run build|lint|test --workspace=functions` run it first;
  the compiled copy lands in `functions/lib`, which is what the deploy uploads. Functions code imports the copy by relative
  path (for example `../vendor/chart-core`). Never edit the copy.

Running `vitest` or `tsc` inside `functions/` directly (not through npm scripts) needs `npm run vendor --workspace=functions` first.

## Tests

`npm test --workspace=@astroweb/chart-core`. Shared test fixtures (real backend charts) are exported as
`@astroweb/chart-core/test-fixtures` so web tests read the same data.
