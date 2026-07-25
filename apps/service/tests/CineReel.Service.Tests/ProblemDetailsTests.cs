using CineReel.Service.Infrastructure.ProblemDetails;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class ProblemDetailsTests
{
    [Theory]
    [InlineData("validation-failed", 400)]
    [InlineData("unauthenticated", 401)]
    [InlineData("forbidden", 403)]
    [InlineData("subscription-not-found", 404)]
    [InlineData("media-item-not-found", 404)]
    [InlineData("drive-not-mounted", 409)]
    [InlineData("invalid-drive-key", 400)]
    [InlineData("invalid-imdb-id", 400)]
    [InlineData("duplicate-subscription", 409)]
    [InlineData("nfo-parse-failed", 422)]
    [InlineData("jellyfin-push-failed", 502)]
    [InlineData("bt-engine-unavailable", 503)]
    [InlineData("trailer-fetch-failed", 502)]
    [InlineData("hyper-agent-unavailable", 503)]
    [InlineData("internal", 500)]
    [InlineData("not-found", 404)]
    public void Type_uri_is_stable(string slug, int expectedStatus)
    {
        var uri = $"{ProblemTypes.BaseUri}{slug}";
        Assert.StartsWith(ProblemTypes.BaseUri, uri);
        Assert.EndsWith(slug, uri);
        _ = expectedStatus;
    }
}
