namespace Cinereel.Features.Drive;

public readonly record struct DriveId(Guid Value)
{
    public static DriveId New() => new(Guid.NewGuid());

    public static bool TryParse(string? value, out DriveId driveId)
    {
        if (Guid.TryParse(value, out var parsed) && parsed != Guid.Empty)
        {
            driveId = new DriveId(parsed);
            return true;
        }

        driveId = default;
        return false;
    }

    public override string ToString() => Value.ToString("D");
}

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

public readonly record struct DriveRemark
{
    public const int MaxLength = 500;

    private DriveRemark(string? value)
    {
        Value = value;
    }

    public string? Value { get; }

    public static bool TryCreate(string? value, out DriveRemark remark)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        if (normalized is null || normalized.Length <= MaxLength)
        {
            remark = new DriveRemark(normalized);
            return true;
        }

        remark = default;
        return false;
    }
}

public readonly record struct IdempotencyKey
{
    public const int MaxLength = 128;

    private IdempotencyKey(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out IdempotencyKey idempotencyKey)
    {
        if (value is { Length: > 0 and <= MaxLength } && value.All(IsVisibleAscii))
        {
            idempotencyKey = new IdempotencyKey(value);
            return true;
        }

        idempotencyKey = default;
        return false;
    }

    public override string ToString() => Value;

    private static bool IsVisibleAscii(char value) => value is >= '!' and <= '~';
}
