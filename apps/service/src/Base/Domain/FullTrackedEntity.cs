namespace Cinereel.Base.Domain;

public abstract class FullTrackedEntity : CreationTrackedEntity
{
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}