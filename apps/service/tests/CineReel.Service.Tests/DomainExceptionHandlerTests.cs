using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Infrastructure.ProblemDetails;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class DomainExceptionHandlerTests
{
    [Fact]
    public async Task Domain_validation_exception_emits_problem_with_errors()
    {
        var context = NewContext();
        var handler = new DomainExceptionHandler(NullLogger<DomainExceptionHandler>.Instance);

        var handled = await handler.TryHandleAsync(context, DomainValidationException.For("username", "must be 3+ chars"), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
        Assert.Equal("application/problem+json", context.Response.ContentType);
        Assert.Contains(ProblemTypes.ValidationFailed, await ReadBodyAsync(context));
    }

    [Fact]
    public async Task Recoverable_exception_emits_retry_after_header()
    {
        var context = NewContext();
        var handler = new DomainExceptionHandler(NullLogger<DomainExceptionHandler>.Instance);

        await handler.TryHandleAsync(context, new RecoverableException("wait", TimeSpan.FromSeconds(15)), CancellationToken.None);

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, context.Response.StatusCode);
        Assert.Equal("15", context.Response.Headers["Retry-After"]);
    }

    private static HttpContext NewContext()
    {
        var context = new DefaultHttpContext();
        context.Items["CorrelationId"] = "test-correlation";
        context.Request.Path = "/api/auth/login";
        context.Response.Body = new MemoryStream();
        return context;
    }

    private static async Task<string> ReadBodyAsync(HttpContext context)
    {
        context.Response.Body.Position = 0;
        using var reader = new StreamReader(context.Response.Body);
        return await reader.ReadToEndAsync();
    }
}
