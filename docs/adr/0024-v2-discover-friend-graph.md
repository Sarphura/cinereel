# V2 discover mechanism: friend-graph over Profile Drives

V2 will add a discovery surface built on **friend-graph**: each Cinereel node maintains a list of `friendProfileKey`s it trusts. When subscribing, the App Server walks the transitive closure of the friend graph (limited depth 1–2 hops) and surfaces the resulting publishers and their `collections[]`. Centralised indexes are explicitly rejected.

## Context

ADR 0013 chose manual-only entry for V1 because (a) no central index was desired, (b) HyperDHT doesn't natively provide search. V1's cold-start is solved by the early-adopter product niche.

V2 needs to widen discoverability. Three plausible shapes:

- **Friend graph**: trust-based, no central service, works with existing Profile Drives. P2P-pure.
- **Central index**: a hosted service that publishes a list of `driveKey`s per topic. Easy to use but adds a service to operate.
- **No discover**: keep manual entry forever.

## Decision

V2 picks **friend graph**. Concretely:

1. Each node's Profile Drive carries an optional `friends[]` array of `friendProfileKey`s.
2. The Application Server reads its own Profile Drive's `friends[]` and walks each friend's `collections[]`.
3. The poster wall gains a "Friends" tab that lists all publishers reachable via 1-hop friend edges.
4. Optional: a 2-hop walk where A → B → C's collections are visible but visually distinct (e.g. dimmed).
5. Friend-adding is itself a manual action: paste a friend's `profileKey`.

This mechanism reuses existing Profile Drive structures (ADR 0014) and Hyper Agent RPC paths. No new infrastructure.

## Why not central index

- A central index contradicts the P2P philosophy Cinereel is built on.
- Operating a central index is a service burden.
- Central indexes become single points of failure and centralisation vectors.

## Why not "no discover"

- V1's product niche is early adopters. V2 needs to support a broader audience.
- Friend graph is the natural extension of the existing Profile model.

## What's not in V2 discover

- A global search index.
- A "trending publishers" feed.
- Recommendation algorithms.
- Federated / ActivityPub-style protocols.

## Trade-off accepted

- Discovery is bounded by the user's network of friends. A new user with zero friends sees an empty Friends tab. Onboarding flows will need to address this.
- The friend graph trust model implies that an "unfollow" decision propagates symmetrically. V2 will need a follow/unfollow UI that removes the friend from both ends.
