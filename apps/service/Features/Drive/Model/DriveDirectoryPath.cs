namespace Cinereel.Features.Drive;

public readonly record struct DriveDirectoryPath
{
    public const int MaxLength = DriveFilePath.MaxLength;

    private DriveDirectoryPath(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out DriveDirectoryPath path)
    {
        if (DriveFilePath.IsValidAbsolutePath(value, allowRoot: true))
        {
            path = new DriveDirectoryPath(value!);
            return true;
        }

        path = default;
        return false;
    }

    public override string ToString() => Value;
}
