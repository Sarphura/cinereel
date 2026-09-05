namespace Cinereel.Features.Drive;

internal sealed class DriveEntity
{
    internal Guid Id { get; set; }

    internal string? Key { get; set; }

    internal string Name { get; set; } = string.Empty;

    internal string ContentTypeId { get; set; } = string.Empty;

    internal string Description { get; set; } = string.Empty;

    internal long ManifestRevision { get; set; }

    internal long ManifestSyncedRevision { get; set; }

    internal DateTimeOffset ManifestCreatedAt { get; set; }

    internal DateTimeOffset ManifestUpdatedAt { get; set; }

    internal string? ManifestErrorCode { get; set; }

    internal int ManifestAttempts { get; set; }

    internal DateTimeOffset? ManifestNextAttemptAt { get; set; }

    internal string? IdempotencyKey { get; set; }

    internal string? CreationRequestHash { get; set; }

    internal DriveStatus Status { get; set; }

    internal DriveRelationType RelationType { get; set; }

    internal string? Remark { get; set; }

    internal DateTimeOffset CreatedAt { get; set; }

    internal DateTimeOffset UpdatedAt { get; set; }
}

internal enum DriveStatus
{
    Pending = 0,
    Ready = 1,
    Failed = 2,
    Deleted = 3
}

public enum DriveRelationType
{
    None = 0,
    Ownership = 1,
    Subscription = 2
}

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
