namespace CineReel.Service.Data.Entities;

public sealed class SessionEntity
{
    public required string Token { get; set; }
    public int AccountId { get; set; }
    public AccountEntity? Account { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastUsedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}
