namespace CineReel.Service.Features.Metadata;

/// <summary>
/// One person entry from an NFO file (actor, director, etc). `Role`
/// holds the character name for actors; `Thumb` is the optional
/// remote URL of the person's avatar.
/// </summary>
public sealed record NfoPerson(string Name, string? Role = null, string? Thumb = null);

/// <summary>
/// Catch-all bag of fields the parser doesn't recognize. The scanner
/// (ticket 22) keeps these around so that V2 features (e.g. custom
/// badges, advanced search) can read them without re-parsing the NFO.
/// </summary>
public sealed record NfoRawFields(IReadOnlyDictionary<string, string> Extensions)
{
    public static readonly NfoRawFields Empty = new(new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));
}
