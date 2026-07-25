# 04 — Sweep ADRs 0001-0063 to use "Hyper Agent" instead of "Sidecar"

**What to build:** Every Architecture Decision Record that references "Sidecar" or "Hyper Sidecar" is updated to say "Hyper Agent". The CONTEXT.md glossary entry is updated to match. The rename is purely textual — no semantic change to any decision. After this ticket, the repository's vocabulary is consistent: code, ADRs, glossary, log lines, and OpenAPI title all use "Hyper Agent".

**Blocked by:** None — runs in parallel with 01/02/03

**Status:** ready-for-agent

- [ ] ADR titles and bodies for 0001 through 0063 contain zero occurrences of `Sidecar` or `Hyper Sidecar` (case-insensitive, excluding intentional cross-references that were already correct)
- [ ] `CONTEXT.md` glossary entry for "Hyper Agent" exists; the legacy "Sidecar" glossary entry is removed
- [ ] `CONTEXT.md` Architecture-at-a-glance diagram and Process topology use "Hyper Agent"
- [ ] ADRs whose titles were named after "Sidecar" (e.g. 0044-sidecar-shape-mirror) keep their numeric filename for git history; only the title and body change
- [ ] A grep for `sidecar` over `docs/` returns zero hits except where intentional (token filename `sidecar.token`, header `X-Sidecar-Token` — both preserved by ADR 0065's backward-compat rule)
