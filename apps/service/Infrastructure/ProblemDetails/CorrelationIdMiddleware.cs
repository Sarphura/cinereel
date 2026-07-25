using Microsoft.AspNetCore.Http;

namespace CineReel.Service.Infrastructure.ProblemDetails;

public sealed class CorrelationIdMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Cinereel-Request-Id";

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers[HeaderName].ToString();
        if (string.IsNullOrWhiteSpace(correlationId))
        {
            correlationId = Guid.NewGuid().ToString("N");
        }
        context.Items["CorrelationId"] = correlationId;
        context.Response.Headers[HeaderName] = correlationId;
        await next(context);
    }
}
