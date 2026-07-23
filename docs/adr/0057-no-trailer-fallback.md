# V1 does not fetch trailers from IMDb / TMDB / YouTube; trailers must be present in the publisher's drive

The Cinereel Application Server does not call any external API to discover or fetch trailers. A trailer URL must be present in the publisher's resource drive (as `/trailer.mp4` next to the media item, or referenced in `descriptor.json`) to be available to subscribers. If no trailer is present, the `MediaItem.trailerUrl` is `null` and the web UI's poster wall renders the trailer button as disabled.

## Context

Cinereel is local-first and offline-capable. Calling out to IMDb / TMDB / YouTube to fetch trailer metadata or bytes violates that. Three plausible shapes:

- **No fallback** — trailer must be in the drive. Strictly offline.
- **IMDb / TMDB fallback** — fetch metadata when the drive has none.
- **Publisher-side only** — the publisher fills `trailer_url` when creating the drive; subscribers use what's there.

## Decision

No fallback. Trailers are publisher-side content only.

### Where trailers live in the drive

```
<resource-drive>/
├── <Media Item folder>/
│   ├── movie.nfo
│   ├── poster.jpg
│   ├── trailer.mp4          ← optional
│   └── <infohash>.torrent
└── descriptor.json
```

The App Server scans the resource drive for `trailer.mp4` at the same level as `poster.jpg`. If found, it populates `MediaItem.trailerUrl` with a synthetic internal URL: `/api/trailers/{imdb-id-or-local-id}`.

### What subscribers see

- If `trailer.mp4` exists → trailer button enabled, plays inline.
- If `trailer.mp4` does not exist → trailer button disabled, tooltip "no trailer available".

### Why this is the right shape

- Local-first: subscribers need not have internet access.
- No external API key management.
- Publishers who care about trailers bundle the file themselves (this is a curation step, like NFO editing).

### Why not IMDb / TMDB fallback

- Requires an API key (TMDB) or scraping (IMDb), both of which violate local-first.
- Increases dependency surface: a TMDB outage would break Cinereel's poster wall.
- Trailer content is copyrighted; the publisher must own or have licensed the file.

### Why not YouTube URLs

- Embeds a third-party iframe on the local poster wall.
- Subject to YouTube API terms and rate limits.
- Mixes local-first with cloud rendering.

### What's NOT in V1

- Trailer discovery via external APIs.
- Automatic trailer download from a publisher's URL.
- Trailer transcoding (a publisher's `.mp4` is served as-is).

## Trade-off accepted

- A subscriber can only see trailers if the publisher bundled them.
- A user who wants to add a trailer to an existing drive must repack the drive.
- IMDb / TMDB integration is a V2 feature if requested.