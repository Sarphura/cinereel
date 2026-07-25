using System.Text.Json;
using CineReel.Service.Domain.Common;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class ValueObjectTests
{
    private const string ValidDriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Theory]
    [InlineData("")]
    [InlineData("ABCDEF")]
    [InlineData("0123")]
    public void DriveKey_rejects_invalid_values(string value)
    {
        var error = Assert.Throws<DomainValidationException>(() => new DriveKey(value));
        Assert.Contains("driveKey", error.Errors.Keys);
    }

    [Fact]
    public void DriveKey_round_trips_through_json()
    {
        var json = JsonSerializer.Serialize(new DriveKey(ValidDriveKey));
        Assert.Equal($"\"{ValidDriveKey}\"", json);
        Assert.Equal(new DriveKey(ValidDriveKey), JsonSerializer.Deserialize<DriveKey>(json));
    }

    [Theory]
    [InlineData("")]
    [InlineData("0123456789abcdef")]
    public void Infohash_rejects_invalid_values(string value) =>
        Assert.Throws<DomainValidationException>(() => new Infohash(value));

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Numeric_ids_must_be_positive(int value)
    {
        Assert.Throws<DomainValidationException>(() => new SubscriptionId(value));
        Assert.Throws<DomainValidationException>(() => new MediaItemId(value));
    }

    [Theory]
    [InlineData("")]
    [InlineData("/absolute")]
    [InlineData("../escape")]
    public void Relative_paths_reject_unsafe_values(string value)
    {
        Assert.Throws<DomainValidationException>(() => new MediaItemPath(value));
        Assert.Throws<DomainValidationException>(() => new TorrentPath(value));
    }
}
