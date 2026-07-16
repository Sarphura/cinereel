# AGENTS.md

## Cursor Cloud specific instructions

Cinereel is a single product: a local-first, P2P media library built on Hyperdrive/Hyperswarm. It is a pnpm workspace monorepo with two runnable apps:

- `apps/service` (`@cinereel/service`) — NestJS + Fastify backend node (HTTP API + P2P replication).
- `apps/web` (`@cinereel/ui`) — React + Vite dashboard that proxies `/api` to the service.

Toolchain: Node 22 and pnpm (`packageManager` pins `pnpm@10.25.0`); both are already installed. Dependencies are refreshed by the startup update script (`pnpm install`).

### Running (dev)

- `pnpm dev` starts three processes concurrently: a local `hyperdht` bootstrap node (`:49737`), the Vite UI (`http://localhost:3010`), and the NestJS service (`http://localhost:3000`). The UI dev server proxies `/api` → `:3000`.
- Swagger UI is served at `http://localhost:3000/docs` (disabled when `NODE_ENV=production`).
- `pnpm dev:peer` starts a second node (UI `:3011`, service `:3001`, swarm `:49739`) — only needed to test publish/subscribe replication between two local nodes. `pnpm dev` must be running first (both use the same bootstrap on `:49737`).
- There is no combined production server: `pnpm build` only builds the UI, and `pnpm start` only runs the compiled service; they are not wired together.

### Lint / test / build

- Tests: `pnpm test` runs **service tests only** (Vitest). Web tests: `pnpm --filter ui test`.
- There is no ESLint/Prettier. The closest thing to a lint gate is the web typecheck: `pnpm --filter ui typecheck` (`tsc --noEmit`).
- Build: `pnpm --filter ui build` (Vite) and `pnpm --filter @cinereel/service build` (tsc).

### Non-obvious gotchas

- **Broad `.gitignore` rules hide source files.** The ignore file contains bare `storage/`, `test/`, and `cache/` patterns that match directories with those names *anywhere* in the tree — including legitimate source dirs like `apps/service/src/common/storage/` and `apps/web/src/test/`. When adding files under such directories, verify they are tracked (`git check-ignore -v <path>` / `git status --ignored`) and add an explicit negation rule if needed, or the file will silently never be committed.
- **Service dev state lives in `apps/service/test/.tmp/`** (Corestore data + JSON caches such as `drives.json`, `download-jobs.json`). Drive/profile persistence is plain JSON files there. To reset a node to a clean slate, stop the service and delete that directory.
- **`@swc/core`'s install script is not approved by pnpm** (you'll see an "Ignored build scripts" warning). This is fine for development because the service runs via `ts-node-dev`, not swc.
- **Known pre-existing failures unrelated to environment setup:** `pnpm --filter ui typecheck` reports 4 `toBeInTheDocument` errors (jest-dom's type augmentation is not wired into `apps/web/tsconfig.json`), and `apps/web/src/features/profile/api.test.ts` fails because it expects `VITE_API_BASE_URL=http://localhost:3000` but nothing sets it in the test environment.
