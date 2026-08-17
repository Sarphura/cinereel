using System.Globalization;
using System.Xml.Linq;
using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// XDocument-backed NFO parser. It walks the
/// Kodi movie.nfo schema, extracts the documented fields, and shoves
/// everything else into <see cref="NfoRawFields.Extensions"/>. The
/// parser is tolerant of missing fields — only a malformed root or
/// unrecoverable XML triggers a <see cref="DomainValidationException"/>.
/// </summary>
public sealed class XDocumentNfoParser : INfoParser
{
    public Task<ParsedNfo> ParseAsync(string driveKey, string drivePath, Stream stream, CancellationToken cancellationToken = default)
    {
        XDocument doc;
        try
        {
            doc = XDocument.Load(stream, LoadOptions.None);
        }
        catch (Exception ex) when (ex is System.Xml.XmlException or IOException)
        {
            throw DomainValidationException.WithFields(("xml", $"{ex.GetType().Name}: {ex.Message}"));
        }

        cancellationToken.ThrowIfCancellationRequested();

        var root = doc.Root ?? throw DomainValidationException.WithFields(("root", "must be <movie>"));
        if (!string.Equals(root.Name.LocalName, "movie", StringComparison.OrdinalIgnoreCase))
        {
            throw DomainValidationException.WithFields(("root", "must be <movie>"));
        }

        var title = (string?)root.Element("title") ?? throw DomainValidationException.WithFields(("title", "is required"));
        var originalTitle = (string?)root.Element("originaltitle");
        var year = ParseInt((string?)root.Element("year"));
        var imdbId = (string?)root.Element("imdbid") ?? (string?)root.Element("id");
        var runtime = ParseInt((string?)root.Element("runtime"));
        var plot = (string?)root.Element("plot");
        var trailer = (string?)root.Element("trailer");
        var poster = (string?)root.Element("poster") ?? (string?)root.Element("thumb");
        var fanart = (string?)root.Element("fanart");
        var mpaa = (string?)root.Element("mpaa") ?? (string?)root.Element("certification");

        var genres = ChildrenAsStrings(root, "genre");
        var studios = ChildrenAsStrings(root, "studio");
        var tags = ChildrenAsStrings(root, "tag");
        var directors = ChildrenAsPeople(root, "director");
        var actors = ChildrenAsPeople(root, "actor");

        var known = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "title", "originaltitle", "year", "imdbid", "id", "runtime", "plot", "trailer",
            "poster", "thumb", "fanart", "mpaa", "certification", "genre", "studio", "tag",
            "director", "actor", "id",
        };

        var raw = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var element in root.Elements())
        {
            var name = element.Name.LocalName;
            if (known.Contains(name)) continue;
            raw[name] = element.Value;
        }

        var nfo = new ParsedNfo(
            Title: title,
            OriginalTitle: originalTitle,
            Year: year,
            ImdbId: imdbId,
            RuntimeMinutes: runtime,
            Plot: plot,
            Genres: genres,
            Directors: directors,
            Actors: actors,
            Studios: studios,
            TrailerUrl: trailer,
            PosterPath: poster,
            FanartPath: fanart,
            Mpaa: mpaa,
            Tags: tags,
            Raw: new NfoRawFields(raw));

        return Task.FromResult(nfo);
    }

    private static int? ParseInt(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
    }

    private static IReadOnlyList<string> ChildrenAsStrings(XElement parent, string name)
    {
        return parent.Elements(name)
            .Select(static element => (element.Value ?? string.Empty).Trim())
            .Where(static value => value.Length > 0)
            .ToList();
    }

    private static IReadOnlyList<NfoPerson> ChildrenAsPeople(XElement parent, string name)
    {
        return parent.Elements(name)
            .Select(static element => new NfoPerson(
                Name: (element.Value ?? string.Empty).Trim(),
                Role: (string?)element.Element("role"),
                Thumb: (string?)element.Element("thumb")))
            .Where(static person => person.Name.Length > 0)
            .ToList();
    }
}
