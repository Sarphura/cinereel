# Trailer file naming: `trailer.<ext>` at the root of the movie folder

Trailers stored inside a Resource Drive are recognised by the .NET Application Server as `trailer.<ext>` placed at the root of the movie folder (sibling to `poster.*`, `movie.nfo`, and `*.torrent`). The Application Server pushes the trailer into the Jellyfin staging folder using the same name. Jellyfin's library scan automatically picks it up as the movie's trailer without further configuration.

## Context

`08-movie-scanning.md` did not specify a trailer naming rule. After the Q15 decision that trailers go over Sidecar HTTP Range (ADR 0005) and the ADR 0007 Jellyfin folder layout, the trailer's location and filename became a missing piece.

Two precedents are useful:

- **Kodi convention**: the `<trailer>` element in `movie.nfo` holds a URL (typically YouTube). Kodi does not expect a local file.
- **Jellyfin convention**: Jellyfin scans a movie folder for `trailer.mp4` (or `trailer.<video-ext>`) and surfaces it as the movie's trailer in its UI. This is Jellyfin's first-class local-trailer mechanism.

The Cinereel approach favours the Jellyfin convention because:

- The trailer is locally staged (we already download it from Hyperdrive).
- Jellyfin users who navigate directly to a movie see the trailer in the standard place.
- We don't depend on YouTube URL availability, which can rot.

## Decision

Trailer naming inside a movie folder:

1. `trailer.<ext>` — primary, where `<ext>` ∈ `{mp4, webm, mkv, mov}`
2. `trailer-trailer.<ext>` — fallback for tools that double-tag filenames
3. `<foldername>-trailer.<ext>` — fallback for download-station layouts
4. `Extras/trailer.*` and other subdirectories are **not** recognised. We do not recurse.

The matching is case-insensitive (`toLowerCase` first).

The Application Server:

- Adds `trailerPath` to `media_items` schema (already reserved in ADR 0008, schema unchanged).
- Writes the trailer into the Jellyfin staging folder as `trailer.<ext>` (not `<foldername>-trailer.<ext>`) so Jellyfin's scanner sees the canonical name regardless of how it was named in the drive.
- Prefers local `trailer.*` over the NFO's `<trailer>` URL. If the local trailer exists, the NFO field is left untouched but ignored by Cinereel.

## Why this bounded set

- More candidates are unnecessary noise. Most publishers either name it `trailer.mp4` or download-station-style `<foldername>-trailer.mp4`.
- Recursing into `Extras/` would violate the existing "only direct children of the movie folder are scanned" rule from `08-movie-scanning.md` and would conflict with the rule that subs/extras are not movie folders themselves.

## Trade-off accepted

Publishers using `Extras/trailer.mp4` are silently ignored — the Application Server will not find a trailer. This is acceptable because publishers can rename their trailer to `trailer.mp4` at the movie folder root, and the rule is now documented.
