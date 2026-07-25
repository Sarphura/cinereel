using CineReel.Service.Features.Accounts;
using CineReel.Service.Infrastructure.Auth;
using Microsoft.AspNetCore.Http;

namespace CineReel.Service.Infrastructure.Auth;

public sealed class SessionAuthenticationMiddleware(RequestDelegate next, ISessionService sessions, TimeProvider clock)
{
    public const string CookieName = "cinereel_session";

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Cookies.TryGetValue(CookieName, out var token) || string.IsNullOrEmpty(token))
        {
            context.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity());
            await next(context);
            return;
        }
        var session = await sessions.LookupAsync(token, context.RequestAborted);
        if (session is null || session.ExpiresAt < clock.GetUtcNow() || session.Account is null || !session.Account.Enabled)
        {
            context.Response.Cookies.Delete(CookieName, new CookieOptions
            {
                HttpOnly = true,
                Secure = context.Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Path = "/",
            });
            context.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity());
            await next(context);
            return;
        }
        await sessions.RefreshAsync(session, context.RequestAborted);
        context.User = CinereelClaims.BuildPrincipal(session.Account.Id, session.Account.Username, session.Account.IsAdmin, session.Account.Permissions);
        context.Response.Cookies.Append(CookieName, session.Token, new CookieOptions
        {
            HttpOnly = true,
            Secure = context.Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            Expires = session.ExpiresAt,
        });
        await next(context);
    }
}
