using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.Logging;

public sealed class RequestIdLogScope(RequestDelegate next)
{
    public const string HeaderName = "X-Cinereel-Request-Id";
    public const string LogScopeKey = "RequestId";

    public async Task InvokeAsync(HttpContext context, ILogger<RequestIdLogScope> logger)
    {
        var requestId = context.Request.Headers[HeaderName].ToString();
        if (string.IsNullOrWhiteSpace(requestId))
        {
            requestId = Guid.NewGuid().ToString("N");
        }
        context.Items[LogScopeKey] = requestId;
        context.Response.Headers[HeaderName] = requestId;
        using (logger.BeginScope(new Dictionary<string, object> { ["RequestId"] = requestId }))
        {
            await next(context);
        }
    }
}
