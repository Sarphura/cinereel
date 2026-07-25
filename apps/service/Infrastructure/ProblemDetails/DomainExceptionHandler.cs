using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace CineReel.Service.Infrastructure.ProblemDetails;

public sealed class DomainExceptionHandler(ILogger<DomainExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var correlationId = httpContext.Items["CorrelationId"] as string ?? Guid.NewGuid().ToString("N");
        var problem = MapException(exception, correlationId, httpContext.Request.Path);
        if (problem.Status >= 500)
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Path} correlationId={CorrelationId}",
                httpContext.Request.Method, httpContext.Request.Path, correlationId);
        }
        else
        {
            logger.LogInformation(exception, "Request rejected for {Method} {Path} status={Status} correlationId={CorrelationId}",
                httpContext.Request.Method, httpContext.Request.Path, problem.Status, correlationId);
        }
        httpContext.Response.StatusCode = problem.Status;
        if (problem.Headers is not null)
        {
            foreach (var (key, value) in problem.Headers)
            {
                httpContext.Response.Headers[key] = value;
            }
        }
        await httpContext.Response.WriteAsJsonAsync(problem.Body, options: null, contentType: "application/problem+json", cancellationToken);
        return true;
    }

    private static ProblemResult MapException(Exception exception, string correlationId, string instance)
    {
        return exception switch
        {
            DomainValidationException validation => ProblemResult.Json(new
            {
                type = ProblemTypes.ValidationFailed,
                title = "validation failed",
                status = StatusCodes.Status400BadRequest,
                detail = "One or more values failed validation.",
                correlationId,
                instance,
                errors = validation.Errors,
            }),
            UnauthorizedAccessException => ProblemResult.Json(new
            {
                type = ProblemTypes.Unauthenticated,
                title = "authentication required",
                status = StatusCodes.Status401Unauthorized,
                correlationId,
                instance,
            }, additionalHeaders: new Dictionary<string, string> { ["WWW-Authenticate"] = "Cookie" }),
            RecoverableException recoverable => ProblemResult.Json(new
            {
                type = ProblemTypes.HyperAgentUnavailable,
                title = "transient failure",
                status = StatusCodes.Status503ServiceUnavailable,
                detail = recoverable.Message,
                correlationId,
                instance,
            }, status: StatusCodes.Status503ServiceUnavailable, additionalHeaders: new Dictionary<string, string> { ["Retry-After"] = ((int)recoverable.RetryAfter.TotalSeconds).ToString(System.Globalization.CultureInfo.InvariantCulture) }),
            NonRecoverableException => ProblemResult.Json(new
            {
                type = ProblemTypes.Internal,
                title = "internal error",
                status = StatusCodes.Status500InternalServerError,
                correlationId,
                instance,
            }, status: StatusCodes.Status500InternalServerError),
            KeyNotFoundException => ProblemResult.Json(new
            {
                type = ProblemTypes.NotFound,
                title = "resource not found",
                status = StatusCodes.Status404NotFound,
                correlationId,
                instance,
            }, status: StatusCodes.Status404NotFound),
            _ => ProblemResult.Json(new
            {
                type = ProblemTypes.Internal,
                title = "internal error",
                status = StatusCodes.Status500InternalServerError,
                correlationId,
                instance,
            }, status: StatusCodes.Status500InternalServerError),
        };
    }
}

internal readonly record struct ProblemResult(object Body, int Status, IReadOnlyDictionary<string, string>? Headers = null)
{
    public static ProblemResult Json(object body, int status = StatusCodes.Status400BadRequest, IReadOnlyDictionary<string, string>? additionalHeaders = null) =>
        new(body, status, additionalHeaders);
}
