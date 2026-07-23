# Jellyfin library root layout uses `<Title> (<Year>) {imdb-<id>}` to prevent cross-folder collisions

The .NET Application Server writes Cinereel Media Items into the Jellyfin library root using a canonical folder name and a normalized NFO file. The canonical folder name is `<Title> (<Year>) {imdb-<id>}`, where `<id>` is an IMDb ID of the form `tt\d+`. This makes every Cinereel-published folder uniquely addressable to Jellyfin's scanner, even when different publishers publish the same film.

## Context

Jellyfin's library scanner treats `Movies/Inception (2010)/` and `Movies/Inception (2010) {imdb-tt1375666}/` as two distinct folders. Without the IMDb ID suffix, two publishers publishing the same film would land in the same folder and Jellyfin would either merge them (and pick one) or split them into conflicting metadata entries.

IMDb ID is the only universally stable movie identifier available across publishers. Title and year collide. Internal Cinereel DriveKey is not a useful identity in the Jellyfin namespace.

## Decision

For each Media Item, the Application Server writes:

```
<library-root>/
  Movies/
    <Title> (<Year>) {imdb-<id>}/
      poster.jpg
      movie.nfo
      movie.torrent            # not consumed by Jellyfin; informational
      movie.<video-ext>        # MonoTorrent staging output
```

`<Title>`, `<Year>`, and `<id>` come from parsed NFO metadata. `<Title>` is sanitized for filesystem legality (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` become `-`; leading/trailing whitespace stripped). `<Year>` is always a 4-digit string. `<id>` is the IMDb ID with the `tt` prefix; if the NFO doesn't carry one, the Application Server looks up the IMDb ID via the publisher-supplied `imdbid` field or falls back to deriving it from TMDB cross-reference data already present in the NFO.

## NFO normalization

The Application Server rewrites `movie.nfo` to a normalized form before writing it into the Jellyfin library root:

- `<title>` — primary title
- `<originaltitle>` — original-language title if present in source NFO
- `<year>` — 4-digit string
- `<imdbid>` — `tt\d+`
- `<id>` — same as `<imdbid>`
- `<runtime>`, `<plot>`, `<genre>`, `<director>`, `<actor>`, `<studio>` — preserved from source
- `<trailer>` — preserved (used by Cinereel preview UI; Jellyfin shows its own trailer resolver too)

Other fields are dropped.

## Trailer handling

Trailers are stored in the drive at `trailer.mp4` (or `<title>-trailer.mp4`). When the Application Server pushes the Media Item into Jellyfin, it writes `trailer.mp4` into the same folder. Jellyfin's built-in trailer resolver picks it up.

## Trade-off accepted

- Folder names are uglier (`Inception (2010) {imdb-tt1375666}`) than the bare `Inception (2010)` form Jellyfin recommends. We accept this to keep identities stable.
- IMDb ID is required; if no IMDb ID is available anywhere in the source NFO or publisher metadata, the Media Item cannot be published to Jellyfin and is held in a "needs IMDB lookup" state in the Application Server.
