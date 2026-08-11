# 20 — Metadata parsing: INfoParser via XDocument + ParsedNfo record + NfoRawFields catch-all

**What to build:** The NFO parser from ADR 0012. `INfoParser.ParseAsync(driveKey, drivePath, stream, ct)` reads a Kodi-style `movie.nfo` via `System.Xml.Linq.XDocument` and projects to a `ParsedNfo` record holding only the fields Cinereel uses: `Title`, `OriginalTitle`, `Year`, `ImdbId`, `RuntimeMinutes`, `Plot`, `Genres`, `Directors`, `Actors`, `Studios`, `TrailerUrl`, `PosterPath`, `FanartPath`, `Mpaa`, `Tags`, and `Raw` (a catch-all dictionary of unknown fields). IMDb ID is read from `<imdbid>` or `<id>`. A root element that is not `<movie>` throws `DomainValidationException` with `nfo-parse-failed`. Today the parser does not exist; metadata flows in as opaque bytes.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `Features/Metadata/INfoParser.cs` interface and `XDocumentNfoParser.cs` implementation
- [ ] `Features/Metadata/ParsedNfo.cs` record with all the documented fields
- [ ] `Features/Metadata/NfoPerson.cs` (`Name`, `Role?`, `Thumb?`) and `NfoRawFields.cs` (`Extensions: IReadOnlyDictionary<string, string>`)
- [ ] Root element check: anything other than `movie` throws `DomainValidationException` with `{"root": ["must be <movie>"]}`
- [ ] Repeated elements (`<actor>`, `<director>`, `<genre>`, `<studio>`, `<tag>`) read into `IReadOnlyList<T>`
- [ ] IMDb ID precedence: `<imdbid>` wins; falls back to `<id>`; null otherwise
- [ ] Unknown top-level elements are stored in `Raw.Extensions` keyed by local name
- [ ] Unit tests with fixture NFO files (good, missing imdbid, unknown root, extra fields, malformed XML)
- [ ] `Metadata.UnitTests/Fixtures/` holds 5-10 sample NFO files captured from real Kodi exports (test-only; documented)
- [ ] No endpoint uses the parser yet — the scanner ticket (21) wires it to `SubscriptionCreated`
