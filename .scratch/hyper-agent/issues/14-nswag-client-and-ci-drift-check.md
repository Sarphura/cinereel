# 14 — NSwag client generation and CI drift check

**What to build:** The .NET Application Server's Hyper Agent client is generated from the Hyper Agent's OpenAPI document and checked into the repository. CI regenerates the client on every PR that touches `apps/hyper-agent/` and fails the build if the regenerated file differs from the checked-in version. The contract is now mechanically enforced: a controller change cannot land without a paired client regeneration.

**Blocked by:** 09 (auth shape stable), 10 (version endpoint stable), 13 (read path stable)

**Status:** ready-for-agent

- [ ] `apps/service/src/HyperAgent/HyperAgentClient.g.cs` is generated from the Hyper Agent's `/docs/json` and committed
- [ ] `scripts/regen-hyper-agent-client.sh` (and Windows equivalent) runs NSwag against a running Hyper Agent and writes the file
- [ ] CI runs the regen script on every PR touching `apps/hyper-agent/`; a diff against the checked-in file fails the build
- [ ] The App Server wraps the generated client in a hand-written `IHyperAgentClient` interface that adapts ProblemDetails exceptions to typed C# exceptions
- [ ] No runtime API change: this is a build-time contract enforcement
