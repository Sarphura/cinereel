# Rename Sidecar to Hyper Agent

The process at `apps/sidecar` is renamed to **Hyper Agent**, hosted at `apps/hyper-agent`.

## Context

`apps/sidecar` wraps `hyper-sdk` and owns no business logic. It exposes drive and swarm operations over HTTP to the Application Server. The name "sidecar" was borrowed from the k8s/Envoy pattern, but it creates false expectations — it implies a generic auxiliary process that could host arbitrary concerns. In reality, this process is tightly coupled to Hyperdrive and cannot be repurposed.

## Decision

Rename `apps/sidecar` to `apps/hyper-agent`. Update all references in code, documentation, and ADRs accordingly.

## Considered Options

- **`sidecar`** — existing name, but misleading; suggests a general-purpose auxiliary process rather than a Hyperdrive-specific wrapper.
- **`hyper-node`** — rejected; "Node" is already defined in the glossary as the entire Cinereel instance (App Server + Hyper Agent as a unit). This naming would create a term collision.
- **`hyper-gateway`** — emphasizes the bridging role (HTTP ↔ Hyper protocol), but "gateway" is broader and could suggest routing or protocol translation semantics the process doesn't own.
- **`hyper-adaptor`** — accurate (the process adapts hyper-sdk into an HTTP API), but slightly more technical and awkward to say than "agent".

## Consequences

- All references in code (`apps/sidecar`, `SidecarClient`, `ISidecarClient`, environment variables, etc.) must be renamed.
- ADRs 0001–0063 that reference "Sidecar" or "Hyper Sidecar" are updated to "Hyper Agent".
- The `scripts/check-sdk-boundary.sh` script must be updated.
- Existing deployments with a `sidecar.token` file do not need to change; the file name is unchanged (it lives at the process boundary, not inside one process).
