using System.Security.Cryptography;
using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Accounts;

public interface ISessionService
{
    Task<SessionEntity> IssueAsync(int accountId, string? ipAddress, string? userAgent, CancellationToken cancellationToken = default);
    Task<SessionEntity?> LookupAsync(string token, CancellationToken cancellationToken = default);
    Task RefreshAsync(SessionEntity session, CancellationToken cancellationToken = default);
    Task RevokeAsync(string token, CancellationToken cancellationToken = default);
}

public sealed class SessionService(
    ISessionRepository sessions,
    TimeProvider clock,
    TimeSpan lifetime) : ISessionService
{
    public async Task<SessionEntity> IssueAsync(int accountId, string? ipAddress, string? userAgent, CancellationToken cancellationToken = default)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var now = clock.GetUtcNow();
        var session = new SessionEntity
        {
            Token = token,
            AccountId = accountId,
            CreatedAt = now,
            LastUsedAt = now,
            ExpiresAt = now.Add(lifetime),
            IpAddress = ipAddress,
            UserAgent = userAgent,
        };
        await sessions.AddAsync(session, cancellationToken);
        return session;
    }

    public Task<SessionEntity?> LookupAsync(string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(token)) return Task.FromResult<SessionEntity?>(null);
        return sessions.FindByTokenAsync(token, cancellationToken);
    }

    public async Task RefreshAsync(SessionEntity session, CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow();
        session.LastUsedAt = now;
        session.ExpiresAt = now.Add(lifetime);
        await sessions.SaveAsync(session, cancellationToken);
    }

    public Task RevokeAsync(string token, CancellationToken cancellationToken = default) => sessions.RemoveAsync(token, cancellationToken);
}

public interface IAccountService
{
    Task<AccountEntity> CreateAsync(string username, string password, IReadOnlyList<string> permissions, bool isAdmin = false, CancellationToken cancellationToken = default);
    Task<AccountEntity?> VerifyPasswordAsync(string username, string password, CancellationToken cancellationToken = default);
    Task DisableAsync(int id, CancellationToken cancellationToken = default);
}

public sealed class AccountService(
    IAccountRepository accounts,
    IPasswordHasher hasher,
    TimeProvider clock) : IAccountService
{
    public async Task<AccountEntity> CreateAsync(string username, string password, IReadOnlyList<string> permissions, bool isAdmin = false, CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow();
        var account = new AccountEntity
        {
            Username = username,
            PasswordHash = hasher.Hash(password),
            Permissions = permissions.ToList(),
            IsAdmin = isAdmin,
            CreatedAt = now,
            UpdatedAt = now,
            Enabled = true,
        };
        return await accounts.AddAsync(account, cancellationToken);
    }

    public async Task<AccountEntity?> VerifyPasswordAsync(string username, string password, CancellationToken cancellationToken = default)
    {
        var account = await accounts.FindByUsernameAsync(username, cancellationToken);
        if (account is null || !account.Enabled) return null;
        return hasher.Verify(password, account.PasswordHash) ? account : null;
    }

    public async Task DisableAsync(int id, CancellationToken cancellationToken = default)
    {
        var account = await accounts.FindByIdAsync(id, cancellationToken);
        if (account is null) return;
        account.Enabled = false;
        account.UpdatedAt = clock.GetUtcNow();
        await accounts.SaveAsync(account, cancellationToken);
    }
}
