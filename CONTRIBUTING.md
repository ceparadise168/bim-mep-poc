# Contributing

Thanks for your interest in improving this project.

## Development Setup

Prerequisites: Node.js 20+, Docker (for Redis / TimescaleDB).

```bash
npm install
docker compose up -d redis timescaledb
node --import tsx packages/stream-processor/src/init-db.ts
npm test
```

See `README.md` → "Local Development" for running individual services.

## Workflow

1. Fork and create a feature branch from `main` (e.g. `feat/chaos-scenario-x`).
2. Keep commits focused. Conventional Commits preferred: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`, `test:`.
3. Run `npm run build` and `npm test` before pushing.
4. Open a PR and fill in the template. Link any related issue.

## Code Style

- TypeScript strict mode. Prefer explicit types at module boundaries.
- No new runtime dependencies without justification in the PR description.
- Tests live under `packages/<pkg>/tests/` and use Vitest.

## Reporting Issues

Use the issue templates. Include reproduction steps, expected vs. actual, and environment (OS, Node version, Docker version).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
