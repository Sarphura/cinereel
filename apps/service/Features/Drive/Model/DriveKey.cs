namespace Cinereel.Features.Drive;

public readonly record struct DriveKey
{
    private DriveKey(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out DriveKey driveKey)
    {
        if (value is { Length: 64 } && value.All(Uri.IsHexDigit))
        {
            driveKey = new DriveKey(value.ToLowerInvariant());
            return true;
        }

        driveKey = default;
        return false;
    }

    public override string ToString() => Value;
}
