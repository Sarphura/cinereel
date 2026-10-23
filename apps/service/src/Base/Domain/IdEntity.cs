namespace Cinereel.Base.Domain;

public abstract class IdEntity<TKey> : IEntity
{
    public TKey Id { get; set; } = default!;
}