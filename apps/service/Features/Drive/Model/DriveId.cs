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
