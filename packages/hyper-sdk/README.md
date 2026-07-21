# @cinereel/hyper-sdk

TypeScript wrapper around [`corestore`](https://github.com/holepunchto/corestore),
[`hyperdrive`](https://github.com/holepunchto/hyperdrive), and
[`hyperswarm`](https://github.com/holepunchto/hyperswarm). It is the **only**
way the rest of the CineReel codebase is allowed to touch the hyper layer.

## Design principles

1. **Anti-corruption layer.** The SDK translates the hyper APIs into a small,
   typed surface. Consumers never see `Hyperdrive` / `Corestore` /
   `Hyperswarm` instances — they see `Drive`, `Store`, `SwarmRuntime`.
2. **No business orchestration.** Drive names, types, persistence indexes,
   recovery policies — these belong to the consumer. The SDK stores and
   replicates drives; it does not decide which drives exist or what they
   are called.
3. **Hex-key boundary.** All key-shaped values (public keys, discovery
   keys, peer keys) cross the SDK boundary as 64-char hex strings.
   Buffers are an internal detail.
4. **Drive as a handle.** A `Drive` is a thin handle. It carries the keys,
   a `source` (`namespace` / `key`), and a bound `Files` for file
   operations. It is the only way to act on a drive.

## Public API

```ts
import {
  createStore,
  createSwarmRuntime,
  type Drive,
  type Store,
  type SwarmRuntime,
  type Files,
  InvalidDriveKeyError,
  InvalidPeerKeyError,
  SdkUsageError,
} from '@cinereel/hyper-sdk';
```

### `createStore({ storeDir })` → `Store`

Owns a single `Corestore` and a registry of mounted drives.

```ts
const store = await createStore({ storeDir: './.peer-store' });

// Mount by namespace (Corestore's storage isolation unit).
const meta = await store.mount('metadata-main');

// Mount by known public key (hex).
const remote = await store.mountByKey('<64-char hex>');

// Lookups (no I/O).
const hit = store.get('metadata-main');
const same = store.getByKey(meta.driveKey); // works too

// Snapshot of everything currently mounted.
for (const d of store.list()) {
  console.log(d.driveKey, d.source, d.namespace);
}

// Release a key-mounted drive. Namespace drives live until close().
await store.unmount(remote.driveKey);

await store.close();
```

### `createSwarmRuntime({ port?, bootstrap?, maxPeers? })` → `SwarmRuntime`

Owns a single `Hyperswarm` (Noise keypair, DHT port).

```ts
const swarm = await createSwarmRuntime({ port: 0 });

await swarm.join(meta, { flush: true });

const off = swarm.on('connection', (peer) => {
  console.log('connected', peer.publicKey);
});

console.log(swarm.identity()); // { peerKey, swarmPort, peerCount }

await swarm.flush();
await swarm.destroy();
```

### `Drive.files` → `Files`

Drive-scoped file operations. The same `Files` cannot be transferred to a
different drive.

```ts
const f = meta.files;

await f.write('/hello.txt', Buffer.from('hi'));
const entry = await f.get('/hello.txt');
if (entry?.value) {
  console.log(entry.value.type); // 'file' | 'directory'
}

const stream = await f.read('/hello.txt');
for await (const chunk of stream) {
  // ...
}

await f.delete('/hello.txt');

// Iterate one level of a directory:
for await (const dirent of f.ls('/')) {
  console.log(dirent.path, dirent.type);
}
```

## Boundaries

| Layer        | Path                                       | Allowed to import                       |
| ------------ | ------------------------------------------ | --------------------------------------- |
| Public API   | `src/index.ts`                             | `./public/*`, `./domain/*`              |
| Public types | `src/public/**`                            | (no hyper imports)                      |
| Domain       | `src/domain/**`                            | `./core/*`, `./public/*`                |
| Core         | `src/core/**`                              | `corestore`, `hyperdrive`, `hyperswarm` |

Consumers (`apps/sidecar`, `apps/web`, anything else) import from
`@cinereel/hyper-sdk` only. They MUST NOT import `corestore` / `hyperdrive`
/ `hyperswarm` directly. The `enforce-boundaries.sh` script (in the
sidecar package) verifies this.

## Why hex strings, not Buffers

Buffers are easy to misuse (encoding mistakes, accidental stringification,
slicing the wrong bytes). At the SDK boundary every key is a 64-char
lowercase hex string. Internally we convert to Buffers only where the
underlying library requires it.

## What the SDK explicitly does NOT do

- Persist business metadata (drive name, type, createdAt).
- Decide mount-vs-create strategies (consumers compose `get` + `mount`).
- Provide per-drive ACL or capability tokens.
- Track drive lifecycle beyond `unmount(driveKey)` and `store.close()`.
- Expose the raw `Hyperdrive` / `Corestore` / `Hyperswarm` instances.