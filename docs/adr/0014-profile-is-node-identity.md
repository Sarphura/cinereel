# Profile Drive is a node-level identity; Application Accounts are local RBAC carriers

A Cinereel node owns exactly one Profile Drive — the public P2P identity. Application Accounts (admin / viewer) are HTTP-layer identities used solely for local RBAC. Multiple Application Accounts can exist on one node, but they all share the same Profile Drive; their changes are not differentiated to outside subscribers.

## Context

The pre-existing `docs/05-accounts-permissions.md` already established that Application Accounts are orthogonal to the P2P Main Drive. Grilling made the model concrete by mapping each Application Account role to specific Cinereel permissions (`library:read`, `publish:*`, `admin:*`, etc.) and then made C# the sole authenticator (ADR 0010). The remaining ambiguity is what an Application Account *is* in relation to the Profile Drive.

There are three plausible mappings:

- **Account-as-Publisher** — each Account gets its own Profile Drive. Conflicts with the existing "one node, one Profile Drive" rule and adds noise to the P2P graph.
- **Account-owns-Profile** — one Account is "the publisher"; others are helpers with limited write access. Adds an extra concept (which account owns the profile) without benefit.
- **Profile is node-level** — the Profile Drive is the node's identity; Accounts are RBAC roles on top of that identity. Simplest and matches existing docs.

## Decision

The third option. Concretely:

- One node = one Profile Drive. This is the public face of the node to every subscriber.
- One or more Application Accounts may exist locally. Their credentials authenticate against the C# Application Server (ADR 0010).
- Application Account permissions (`library:read`, `download:*`, `subscribe:*`, `publish:*`, `profile:write`, `admin:*`) gate what each Account can do on the node.
- The Profile Drive is modified by anyone with `profile:write` permission. The Application Server does not record *which* Account wrote each Profile field — to outside subscribers, the Profile Drive simply has whatever its current contents are.
- BT seed sessions and Cinereel-Peer Seed behaviour are node-level, not Account-level. They run regardless of which Account is currently logged in.

## Why

- Keeping Profile as a single node-level identity avoids the "which Account is the publisher?" question entirely. Outside subscribers don't need to know whether the node has 1 or 5 accounts.
- Multiple accounts serve the real use case (family / shared device) where different humans want different permission scopes. They don't serve a need to fragment P2P identity.
- Profile changes are signed by the Profile Drive's Noise keypair; whoever has `profile:write` in the Application Server effectively controls that keypair. This is correct: the node owns the keypair, and the Account is just the gatekeeper.

## Trade-off accepted

- An "audit log of which Account made which change" is not provided. If two admins are editing the Profile simultaneously, last-write-wins. This is acceptable for the V1 product.
- An Application Account cannot have its own separate Profile Drive in the same node. If a user needs two separate publishing identities, they run two nodes.
