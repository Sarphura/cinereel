using CineReel.Service.Data.Entities;
using CineReel.Service.Features.Accounts;
using CineReel.Service.Infrastructure.Auth;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class SessionAuthenticationMiddlewareTests
{
    [Fact]
    public async Task Expired_session_cookie_is_cleared_and_request_continues_anonymously()
    {
        var sessions = new InMemorySessionRepository();
        var clock = new MutableTimeProvider(DateTimeOffset.UtcNow.AddDays(-1));
        var lifetime = TimeSpan.FromMinutes(5);
        var middleware = new SessionAuthenticationMiddleware(_ => Task.CompletedTask,
            new SessionService(sessions, clock, lifetime), clock);
        var account = await AddAccount(sessions);
        var session = await IssueSession(sessions, account, "127.0.0.1", "ua", clock);

        var context = NewContext(new Dictionary<string, string> { [SessionAuthenticationMiddleware.CookieName] = session.Token });

        await middleware.InvokeAsync(context);

        Assert.NotNull(context.User.Identity);
        Assert.False(context.User.Identity.IsAuthenticated);
        Assert.True(context.Response.Headers.ContainsKey("Set-Cookie"));
    }

    private static async Task<int> AddAccount(InMemorySessionRepository sessions)
    {
        var account = new AccountEntity
        {
            Username = "demo",
            PasswordHash = "argon2id$v=19$m=1,t=1,p=1$AAAA$AAAA",
            Permissions = ["audit:read"],
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        var accountRepo = new InMemoryAccountRepository();
        var created = await accountRepo.AddAsync(account);
        return created.Id;
    }

    private static async Task<SessionEntity> IssueSession(InMemorySessionRepository sessions, int accountId, string ip, string ua, TimeProvider clock)
    {
        var session = new SessionEntity
        {
            Token = Convert.ToHexString(Guid.NewGuid().ToByteArray()),
            AccountId = accountId,
            CreatedAt = clock.GetUtcNow(),
            LastUsedAt = clock.GetUtcNow(),
            ExpiresAt = clock.GetUtcNow(),
        };
        await sessions.AddAsync(session);
        return session;
    }

    private static HttpContext NewContext(Dictionary<string, string> cookies)
    {
        var context = new DefaultHttpContext();
        foreach (var kv in cookies)
        {
            context.Request.Headers.Cookie = $"{kv.Key}={kv.Value}";
        }
        return context;
    }

    private sealed class MutableTimeProvider(DateTimeOffset initial) : TimeProvider
    {
        private DateTimeOffset _now = initial;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Set(DateTimeOffset value) => _now = value;
    }
}
