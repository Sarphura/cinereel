namespace CineReel.Service.Data.Entities;

public sealed class PermissionEntity
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public required string Pattern { get; set; }
}
