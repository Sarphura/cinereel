using CineReel.Service.Features.Metadata;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class IMDBResolverTests
{
    private const string DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private const string DrivePath = "/movies/Unknown/movie.nfo";

    [Fact]
    public async Task Direct_imdb_in_nfo_is_returned_without_lookup()
    {
        var resolver = new IMDbResolver(new TmdbClient(new HttpClient(), apiKey: null), NullLogger<IMDbResolver>.Instance);
        var nfo = new ParsedNfo("Unknown", null, 2020, "tt1234567", null, null, [], [], [], [], null, null, null, null, [], NfoRawFields.Empty);

        var result = await resolver.ResolveAsync(nfo, DriveKey, DrivePath);

        Assert.Equal("tt1234567", result.Id);
        Assert.Equal(IDKind.Direct, result.Kind);
    }

    [Fact]
    public async Task Tier1_disabled_falls_through_to_synthetic()
    {
        var resolver = new IMDbResolver(new TmdbClient(new HttpClient(), apiKey: null), NullLogger<IMDbResolver>.Instance);
        var nfo = new ParsedNfo("Unknown", null, 2020, null, null, null, [], [], [], [], null, null, null, null, [], NfoRawFields.Empty);

        var result = await resolver.ResolveAsync(nfo, DriveKey, DrivePath);

        Assert.Equal(IDKind.Synthetic, result.Kind);
        Assert.StartsWith("local-", result.Id);
    }

    [Fact]
    public async Task Tier1_failure_falls_through_to_synthetic()
    {
        // When the API key is set but the call fails, the synthetic ID must still be produced.
        var fake = new FakeHttpMessageHandler();
        fake.ResponseBody = "{\"results\":[]}"; // empty results => fallback
        var http = new HttpClient(fake) { BaseAddress = new Uri("https://api.themoviedb.org") };
        var resolver = new IMDbResolver(new TmdbClient(http, apiKey: "key"), NullLogger<IMDbResolver>.Instance);
        var nfo = new ParsedNfo("Unknown", null, 2020, null, null, null, [], [], [], [], null, null, null, null, [], NfoRawFields.Empty);

        var result = await resolver.ResolveAsync(nfo, DriveKey, DrivePath);

        Assert.Equal(IDKind.Synthetic, result.Kind);
        Assert.StartsWith("local-", result.Id);
    }

    [Fact]
    public async Task Tier1_success_returns_tmdb_imdb_id()
    {
        var fake = new FakeHttpMessageHandler();
        fake.ResponseBody = """{"results":[{"id":42,"imdb_id":"tt7654321","title":"Unknown","release_date":"2020-01-01"}]}""";
        var http = new HttpClient(fake) { BaseAddress = new Uri("https://api.themoviedb.org") };
        var resolver = new IMDbResolver(new TmdbClient(http, apiKey: "key"), NullLogger<IMDbResolver>.Instance);
        var nfo = new ParsedNfo("Unknown", null, 2020, null, null, null, [], [], [], [], null, null, null, null, [], NfoRawFields.Empty);

        var result = await resolver.ResolveAsync(nfo, DriveKey, DrivePath);

        Assert.Equal("tt7654321", result.Id);
        Assert.Equal(IDKind.Tmdb, result.Kind);
    }

    [Fact]
    public async Task Synthetic_id_is_stable_for_same_drivekey_drivepath()
    {
        var resolver = new IMDbResolver(new TmdbClient(new HttpClient(), apiKey: null), NullLogger<IMDbResolver>.Instance);
        var nfo = new ParsedNfo("Unknown", null, null, null, null, null, [], [], [], [], null, null, null, null, [], NfoRawFields.Empty);

        var first = await resolver.ResolveAsync(nfo, DriveKey, DrivePath);
        var second = await resolver.ResolveAsync(nfo, DriveKey, DrivePath);

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(IDKind.Synthetic, first.Kind);
    }
}

internal sealed class FakeHttpMessageHandler : HttpMessageHandler
{
    public string? ResponseBody { get; set; }
    public System.Net.HttpStatusCode StatusCode { get; set; } = System.Net.HttpStatusCode.OK;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var msg = new HttpResponseMessage(StatusCode);
        if (ResponseBody is not null)
        {
            msg.Content = new StringContent(ResponseBody, System.Text.Encoding.UTF8, "application/json");
        }
        return Task.FromResult(msg);
    }
}
