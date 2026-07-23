# C# Application Server parses NFO using XDocument with a hand-rolled projection to a `ParsedNfo` model

The C# Application Server parses Kodi-style `movie.nfo` files via `System.Xml.Linq.XDocument`. Parsing is hand-rolled; no codegen, no `xsd.exe`. The result is projected to an internal `ParsedNfo` record type that holds only the fields Cinereel uses downstream (Jellyfin folder naming, BT scheduling, search indexing, poster wall rendering).

## Context

NFO is a Kodi-style XML with dozens of optional fields. Generating C# classes from `kodi.xsd` would give us strong types for the full schema, but at the cost of:

- A code generation step in the build pipeline (`dotnet-xscgen` or hand-maintained files)
- An explosion of generated types for fields Cinereel doesn't actually consume
- Brittle breakage when a publisher includes fields the codegen didn't anticipate (Kodi's schema is loose; many `movie.nfo` files in the wild carry non-standard extensions)

Hand-rolled XDocument parsing is simpler, fits the working set of fields we care about, and degrades gracefully on unusual inputs.

## Decision

The `ParsedNfo` model:

```csharp
public sealed record ParsedNfo(
    string Title,
    string? OriginalTitle,
    int? Year,
    string? ImdbId,                // 'tt\d+'
    int? RuntimeMinutes,
    string? Plot,
    IReadOnlyList<string> Genres,
    IReadOnlyList<NfoPerson> Directors,
    IReadOnlyList<NfoPerson> Actors,
    IReadOnlyList<string> Studios,
    string? TrailerUrl,
    string? PosterPath,            // in-drive relative
    string? FanartPath,            // in-drive relative
    string? Mpaa,
    IReadOnlyList<string> Tags,
    NfoRawFields Raw               // catch-all for fields we don't model
);

public sealed record NfoPerson(string Name, string? Role, string? Thumb);
public sealed record NfoRawFields(IReadOnlyDictionary<string, string> Extensions);
```

The parser:

- Loads `movie.nfo` into `XDocument`.
- Reads each Cinereel-relevant element with `string?`/null-coalescing semantics.
- For repeated elements (`<actor>`, `<director>`, `<genre>`, `<studio>`, `<tag>`), reads them into `IReadOnlyList<T>`.
- Captures the IMDb ID from either `<imdbid>` or `<id>` (Kodi historically uses both).
- For unknown top-level elements, stores them in `NfoRawFields.Extensions` keyed by local name.
- Returns `ParsedNfo` or throws `NfoParseException` on root element not being `<movie>`.

The parser is exposed as `INfoParser.ParseAsync(string driveKey, string drivePath, Stream nfoStream, CancellationToken ct)`.

## Why not codegen

- NFO schema is loose; codegen will over-constrain.
- ~15 fields out of ~40+ in the Kodi schema matter to Cinereel.
- Hand-rolled projection is ~200 lines, testable, and stable.

## Trade-off accepted

- The `ParsedNfo` model must be extended each time Cinereel starts consuming a new field. This is preferable to dragging 40+ generated fields.
- Unknown fields are kept in `NfoRawFields.Extensions` so future re-projection is possible without re-reading the NFO from the drive.
- NFO files that aren't `<movie>` at root are rejected outright. This is a Cinereel-specific decision — we don't accept `<tvshow>` or `<musicvideo>` NFO files because those resource types aren't supported in the current scope.
