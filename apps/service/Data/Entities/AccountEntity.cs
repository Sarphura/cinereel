namespace CineReel.Service.Data.Entities;

public sealed class AccountEntity
{
    public int Id { get; set; }
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }
    public bool IsAdmin { get; set; }
    public List<string> Permissions { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
    public bool Enabled { get; set; } = true;
    public ICollection<SessionEntity> Sessions { get; set; } = [];
}
