# CI runs in a single Docker container on Ubuntu for V1

V1 CI runs in a single Ubuntu Docker container with both the Node Hyper Agent and the .NET Application Server installed. Tests execute in this single environment. Cross-platform behavior is verified manually before each release.

## Context

After Q33 selected `docker-ci`, the question becomes what CI looks like in practice and whether it suffices for V1. Cross-platform CI matrices (Ubuntu + macOS + Windows) are real engineering value but are also real engineering cost (longer CI runs, more configuration, OS-specific flaky tests). For V1 — a system not yet shipped — single-platform CI is the right balance.

## Decision

CI runs on GitHub Actions using `ubuntu-latest` runners. Inside each runner:

- A pre-built Docker image with Node 22 + .NET 10 SDK is used as the build/test environment.
- `pnpm install --frozen-lockfile` runs against `apps/sidecar` and `apps/web`.
- `pnpm test` runs Hyper Agent unit tests (Vitest).
- `pnpm run lint` runs ESLint + tsc --noEmit on Hyper Agent.
- `dotnet restore && dotnet test` runs Application Server unit tests (xUnit).
- `dotnet build` builds the App Server in Release configuration.
- `pnpm --filter @cinereel/web build` builds the SPA into `apps/web/dist`.
- A smoke integration test launches both processes in the same container and verifies that the App Server can call the Hyper Agent over loopback HTTP, retrieve a Drive descriptor, and shut both processes down cleanly.

## What's NOT in CI

- macOS / Windows / Linux native binary builds.
- Cross-platform integration tests (FUSE on Linux only, macFUSE on macOS only, neither on Windows).
- Performance tests.
- Long-running stability tests (>5 minutes).

These are run manually before each release on a representative set of physical machines.

## Trade-off accepted

- A CI green light does not guarantee the system works on macOS or Windows.
- Container-only CI misses filesystem semantic differences (path separators, file locking, extended attributes).
- The smoke integration test is shallow by necessity — exercising every drive + BT path is too slow for CI.

## Migration path

When cross-platform CI becomes necessary (e.g. when a paying customer reports a Windows-only bug), move to a matrix-based CI. The Hyper Agent and App Server are both portable; the change is incremental.
