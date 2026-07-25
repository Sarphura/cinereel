using CineReel.Service.Infrastructure.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Accounts;

public static class LoginEndpoints
{
    public sealed record LoginRequest(string Username, string Password);

    public static IEndpointRouteBuilder MapLoginEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/auth");
        group.MapPost("/login", async (LoginRequest request, IAccountService accounts, ISessionService sessions, HttpContext context, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrEmpty(request.Username) || string.IsNullOrEmpty(request.Password))
            {
                return Results.Problem(statusCode: 400, detail: "username and password are required");
            }
            var account = await accounts.VerifyPasswordAsync(request.Username, request.Password, cancellationToken);
            if (account is null)
            {
                return Results.Problem(statusCode: 401, detail: "invalid credentials");
            }
            var session = await sessions.IssueAsync(account.Id, context.Connection.RemoteIpAddress?.ToString(), context.Request.Headers.UserAgent, cancellationToken);
            context.Response.Cookies.Append(SessionAuthenticationMiddleware.CookieName, session.Token, new CookieOptions
            {
                HttpOnly = true,
                Secure = context.Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Path = "/",
                Expires = session.ExpiresAt,
            });
            return Results.Ok(new { account.Id, account.Username, account.IsAdmin });
        });
        group.MapPost("/logout", async (HttpContext context, ISessionService sessions, CancellationToken cancellationToken) =>
        {
            if (context.Request.Cookies.TryGetValue(SessionAuthenticationMiddleware.CookieName, out var token) && !string.IsNullOrEmpty(token))
            {
                await sessions.RevokeAsync(token, cancellationToken);
            }
            context.Response.Cookies.Delete(SessionAuthenticationMiddleware.CookieName, new CookieOptions
            {
                HttpOnly = true,
                Secure = context.Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Path = "/",
            });
            return Results.NoContent();
        });
        return routes;
    }
}
