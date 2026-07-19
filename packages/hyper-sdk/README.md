# @cinereel/hyper-sdk

Workspace SDK package that wraps Corestore / Hyperdrive / Hyperswarm behind a
small, stable surface so consumers (sidecar, future CLI, future Electron
adapter, future Go/Rust bridges) do not import the raw SDK packages.

## Surface

```ts
import {
  createCorestoreRuntime,    // → CorestoreRuntime { store, main, getOrCreate, close }
  createHyperswarmRuntime,   // → HyperswarmRuntime { swarm, join, leave, destroy }
  resolveDriveByKey,         // hex string → Drive
  driveKeyOf,                // Drive → hex string
  makeDriveService,          // → DriveService { create, list, remove }
  makeFileService,           // → FileService { getEntry, getTree, readStream, write, deleteEntry }
  makeSwarmService,          // → SwarmService { announce, getPeers, mount, unmount, identity }
} from '@cinereel/hyper-sdk';
```

Plus types: `DriveType`, `DriveDescriptor`, `HyperdriveEntry`, `TreeNode`,
`PeerInfo`, `IdentityInfo`.

## Why a package

Before this existed, every consumer would import `corestore` / `hyperdrive`
/ `hyperswarm` directly. That made two things fragile:

1. **API drift** — these packages have unstable typings in places (e.g.
   `corestore`'s `CorestoreApi` is the runtime API, not the type exposed by
   the published `.d.ts`); this package carries an ambient module
   augmentation (`src/hyper-sdk.d.ts`) that pins the surface we depend on.
2. **Process boundary** — once a second consumer exists, every change to
   how we wire `Corestore` / `Hyperswarm` (e.g. swap DHT bootstrap, change
   port allocation policy, switch drive-naming convention) would have to
   be applied N times.

## Boundaries

| Layer | Path | Allowed to import |
|-------|------|-------------------|
| Runtime | `src/runtime/{corestore,hyperswarm}.ts` | `corestore*`, `hyperswarm*` ✓ |
| Factory | `src/hyperdrive.factory.ts` | `hyperdrive*` ✓ |
| Services | `src/services/*` | runtime + factory (NOT raw SDK) |
| Barrel | `src/index.ts` | all of the above |
| Ambient | `src/hyper-sdk.d.ts` | (module augmentations only) |

`apps/sidecar/src/**` is forbidden from importing raw SDK packages — it must
go through this package. Enforced by `apps/sidecar/scripts/check-sdk-boundary.sh`.

## Build / publish

```bash
pnpm --filter @cinereel/hyper-sdk build
```

Produces `dist/` with `.d.ts` declarations. This package is `private: true`
because it is intended for internal workspace consumption only; do not
publish to npm.
