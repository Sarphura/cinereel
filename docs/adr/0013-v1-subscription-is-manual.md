# V1 subscription is manual — subscribers enter a driveKey or a profileKey by hand

V1 ships with no Discover UI. Subscribers obtain publisher identifiers (`driveKey` or `profileKey`) through channels outside Cinereel (private message, social media post, README link) and paste them into the Application Server's subscription form. The Application Server translates either form into the corresponding Hyperdrive mount.

## Context

A "discover" mechanism — a search box over public publishers — implies either a centralized index (which contradicts the P2P philosophy and adds a service-to-operate) or a DHT-level search (which Holepunch / HyperDHT does not natively provide). Cinereel's product pitch ("subscribe to other people's curated libraries and get a poster wall without setup") requires a discover surface eventually, but the V1 cold-start is solvable with manual entry:

- A new user already knows at least one person who uses Cinereel, who can share a link.
- The first users are early adopters who tolerate manual entry.
- A discover UI built on top of nothing is a chicken-and-egg problem (no public publishers until there's a discover UI; no incentive to build the discover UI until there are public publishers).

## Decision

V1 has these subscription entry points only:

- **Subscribe by driveKey** — the user pastes a 64-hex driveKey. The Application Server calls `POST /v1/swarm/mount/:publicKey` on the Hyper Sidecar.
- **Subscribe by profileKey** — the user pastes a 64-hex profileKey. The Application Server first mounts the Profile Drive and reads `/profile.json`, then lists the publisher's `collections[]`. The user picks one or more resource drives from that list, each becoming a separate subscription.

The Application Server exposes a "Subscribe" UI in `apps/web` that supports both flows. No search, no recommendations, no "trending publishers".

V2 (out of scope here) will revisit this when there's a critical mass of public publishers. The choice of V2 mechanism (DHT search vs social-anchor index vs friend-graph) is deferred.

## Trade-off accepted

The cold-start problem is real but is solved by the early-adopter product niche. Cinereel V1 is targeted at users who already curate personal media libraries and want to share them with friends — those users find each other through the existing social graph and don't need a search engine.
