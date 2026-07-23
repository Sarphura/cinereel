# IMDb ID lookup has two fallbacks: optional TMDB lookup, then synthetic local ID

When a Media Item's NFO does not carry an IMDb ID, the .NET Application Server applies two fallbacks in order:

1. **TMDB lookup (online, opt-in)**: if `appsettings.json` configures `Tmdb:ApiKey`, the App Server calls TMDB's `find` endpoint with `<title> + <year>` and retrieves an IMDb ID.
2. **Synthetic local ID (offline, always-on)**: the App Server derives a stable ID from `sha256(driveKey || ':' || drive_path)` and uses its first 16 hex chars prefixed with `local-` (e.g. `local-a3f5b2c8d4e6f789`).

## Context

The ADR 0007 Jellyfin folder naming rule hard-requires an IMDb ID to keep folder identities stable. Real-world NFO files don't always carry one — older Kodi exports (pre-2010) and hand-rolled NFO files often omit `<imdbid>` and `<id>`. Forcing publishers to fix their NFO files is hostile to the "just publish a folder" UX.

## Decision

Tier 1 — TMDB lookup (online, opt-in):

- The Application Server reads `appsettings.json`'s `Tmbo:ApiKey` (or `Tmdb:ApiKey`) at startup. If absent, Tier 1 is skipped.
- When a Media Item is missing IMDb ID, the App Server calls TMDB's `find` endpoint with `title` + `year`. The first result that matches is taken.
- The result is cached in `media_items.imdb_id` and the Item is no longer in "needs IMDb lookup" state.
- The lookup happens once per Media Item and is not retried on failure (avoids API rate-limit loops).

Tier 2 — Synthetic local ID (offline, always-on):

- Used only when Tier 1 returns no result, or when Tier 1 is disabled.
- Form: `local-` + first 16 hex chars of `sha256(driveKey || ':' || drive_path)`.
- Example: `local-a3f5b2c8d4e6f789`.
- The Jellyfin folder name becomes `<Title> (<Year>) {local-<16-hex>}`.
- When a later re-scan finds that the source NFO has gained an IMDb ID (publisher fixed it), the App Server renames the Jellyfin staging folder to the new IMDb-id-based name and updates `media_items.imdb_id`.

## What the poster wall shows

- Items with IMDb IDs show IMDb metadata (via Jellyfin's metadata scraper, optional).
- Items with synthetic IDs show the parsed NFO metadata only.
- Items in `needs_imdb_lookup` state (Tier 1 failed, before Tier 2 applies) are flagged in the Application Server UI as "needs identity resolution".

## Why two tiers

- TMDB lookup is the right answer when the user opts in and has internet access. It gives the natural metadata.
- Synthetic IDs are the right answer for offline / privacy-conscious deployments. They keep the system functional but mark the data as "local-only" by the `local-` prefix.

## Trade-off accepted

- TMDB is a third-party dependency. Rate limits and outages are real.
- The "later re-scan" workflow that migrates synthetic → IMDb IDs adds complexity to the Jellyfin push logic.
- Synthetic IDs are not stable across drive re-publications (re-publishing the same folder under a different drive gets a new synthetic ID). Acceptable because the same publisher re-publishing the same folder is itself a rare event.
