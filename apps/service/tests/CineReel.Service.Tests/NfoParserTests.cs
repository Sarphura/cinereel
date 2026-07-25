using System.Reflection;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Metadata;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class NfoParserTests
{
    private const string DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private const string DrivePath = "/movies/TheMatrix/movie.nfo";

    private static Stream OpenFixture(string name)
    {
        var asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
        var path = Path.Combine(asmDir, "Fixtures", name);
        return File.OpenRead(path);
    }

    [Fact]
    public async Task Parse_good_nfo_extracts_title_year_imdb()
    {
        var parser = new XDocumentNfoParser();
        using var stream = OpenFixture("Movie.TheMatrix.nfo");
        var nfo = await parser.ParseAsync(DriveKey, DrivePath, stream);
        Assert.Equal("The Matrix", nfo.Title);
        Assert.Equal("The Matrix", nfo.OriginalTitle);
        Assert.Equal(1999, nfo.Year);
        Assert.Equal("tt0133093", nfo.ImdbId);
        Assert.Equal(136, nfo.RuntimeMinutes);
        Assert.Equal(new[] { "Action", "Science Fiction" }, nfo.Genres);
        Assert.Equal(new[] { "Warner Bros." }, nfo.Studios);
        Assert.Equal(2, nfo.Directors.Count);
        Assert.Equal(2, nfo.Actors.Count);
        Assert.Equal("Neo", nfo.Actors[0].Role);
        Assert.Equal("PG-13", nfo.Mpaa);
        Assert.Equal(new[] { "dystopia", "simulation" }, nfo.Tags);
    }

    [Fact]
    public async Task Parse_id_tag_falls_back_to_id_when_imdbid_missing()
    {
        var parser = new XDocumentNfoParser();
        using var stream = OpenFixture("Movie.NoImdbId.nfo");
        var nfo = await parser.ParseAsync(DriveKey, DrivePath, stream);
        Assert.Equal("tt0089998", nfo.ImdbId);
    }

    [Fact]
    public async Task Parse_unknown_root_element_throws()
    {
        var parser = new XDocumentNfoParser();
        using var stream = OpenFixture("Movie.NotMovie.nfo");
        var ex = await Assert.ThrowsAsync<DomainValidationException>(() => parser.ParseAsync(DriveKey, DrivePath, stream));
        Assert.Contains("root", ex.Errors.Keys);
    }

    [Fact]
    public async Task Parse_unknown_fields_collected_into_raw_extensions()
    {
        var parser = new XDocumentNfoParser();
        using var stream = OpenFixture("Movie.ExtraFields.nfo");
        var nfo = await parser.ParseAsync(DriveKey, DrivePath, stream);
        Assert.Equal("tt9999999", nfo.ImdbId);
        Assert.Equal("arbitrary-value", nfo.Raw.Extensions["customsection"]);
        Assert.Equal("https://example.com/raw", nfo.Raw.Extensions["scrapeurl"]);
    }

    [Fact]
    public async Task Parse_malformed_xml_throws_domain_validation()
    {
        var parser = new XDocumentNfoParser();
        using var stream = OpenFixture("Movie.Malformed.nfo");
        await Assert.ThrowsAsync<DomainValidationException>(() => parser.ParseAsync(DriveKey, DrivePath, stream));
    }
}
