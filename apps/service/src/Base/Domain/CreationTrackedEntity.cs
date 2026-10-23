namespace Cinereel.Base.Domain;

public abstract class CreationTrackedEntity : IdEntity<Guid>
{
    public DateTimeOffset CreatedAt { get; set; }
    public Guid CreatedBy { get; set; }
}