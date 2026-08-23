namespace Cinereel.Features.Drive;

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
