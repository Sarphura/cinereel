namespace Cinereel.Features.Drive;

public readonly record struct DriveContentTypeId
{
    public const string MovieValue = "cinereel.movie";
    public const string SeriesValue = "cinereel.series";
    public const string MusicValue = "cinereel.music";
    public const string GenericValue = "cinereel.generic";

    private static readonly HashSet<string> SupportedValues =
        new(StringComparer.Ordinal)
        {
            MovieValue,
            SeriesValue,
            MusicValue,
            GenericValue
        };

    private DriveContentTypeId(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out DriveContentTypeId contentTypeId)
    {
        if (value is not null && SupportedValues.Contains(value))
        {
            contentTypeId = new DriveContentTypeId(value);
            return true;
        }

        contentTypeId = default;
        return false;
    }

    public override string ToString() => Value;
}
