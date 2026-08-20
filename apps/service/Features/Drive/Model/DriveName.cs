namespace Cinereel.Features.Drive;

public readonly record struct DriveName
{
    public const int MaxLength = 200;

    private DriveName(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out DriveName name)
    {
        var normalized = value?.Trim();

        if (normalized is { Length: > 0 and <= MaxLength })
        {
            name = new DriveName(normalized);
            return true;
        }

        name = default;
        return false;
    }

    public override string ToString() => Value;
}
