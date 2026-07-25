# Use the Hypercore / Hyperdrive / Hyperswarm protocol stack as the P2P substrate

The platform's P2P layer is built on Holepunch's Hypercore / Hyperdrive / Hyperswarm / Corestore (consumed via the official `hyper-sdk@^6.2.2`). IPFS / libp2p was explicitly considered as an alternative and rejected for this scope. This ADR records the *why* so the next person looking at a missing C# SDK doesn't relitigate it.

## Context

A session opened the possibility of switching to IPFS so that a future .NET client could be written natively. After grilling the actual risks, we committed to staying on Holepunch and treating "no .NET SDK" as a non-blocker.

## Decision

Stay on Holepunch. Node `apps/sidecar` is the only Hyper-protocol host. Any .NET or other-language consumer talks to it over HTTP.

## Why not IPFS

Considered and rejected for this scope:

- **Vendor health is not actually weak.** `holepunchto/hypercore` shipped v11.34.1 on 2026-07-15; `holepunchto/hyperdrive` shipped 13.3.3 on 2026-07-07. 12.2K weekly downloads, 186 dependents, 60 contributors, maintained by Mafintosh / Holepunch with production users Keet and Pear Runtime. Replacing a live stack on speculation is the more expensive path.
- **No C# SDK is real but not fatal.** A .NET consumer would call the Node hyper-agent over HTTP. The cost of "native SDK" is paying the round-trip; the cost of rewriting the protocol is months of work plus the obligation to stay wire-compatible with our own Node fleet.
- **Switching cost is the whole codebase.** `apps/sidecar`, `apps/service`, `drive-key`, `descriptor.json`, `ownerProfileKey`, `CONTEXT.md` — all Holepunch-shaped. An IPFS pivot would discard ~15 design docs and the entire hyper-agent.
- **Holepunch is genuinely better at offline-first.** The whole product thesis — "subscribe and get a poster wall without setup" — depends on a stack that works when peers are sparse. IPFS assumes a denser network.

## Trade-off accepted

The Node hyper-agent becomes a load-bearing dependency. If Holepunch ever stops shipping LTS, the migration path is to swap the `hyper-sdk` adapter behind a stable `HyperdriveLike` boundary — not to rewrite the protocol. We get the offline-first experience we want; we owe future-us a thin adapter layer if the day ever comes.