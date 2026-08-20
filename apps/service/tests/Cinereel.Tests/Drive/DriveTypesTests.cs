using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveTypesTests
{
    [Fact]
    public void DriveIdRejectsEmptyGuid()
    {
        Assert.False(DriveId.TryParse(Guid.Empty.ToString(), out _));
    }

    [Fact]
    public void DriveIdUsesCanonicalText()
    {
        var value = Guid.NewGuid();

        Assert.True(DriveId.TryParse(value.ToString("N"), out var driveId));
        Assert.Equal(value.ToString("D"), driveId.ToString());
    }

    [Fact]
    public void DriveKeyNormalizesHexToLowercase()
    {
        var value = new string('A', 64);

        Assert.True(DriveKey.TryCreate(value, out var driveKey));
        Assert.Equal(new string('a', 64), driveKey.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("abcd")]
    [InlineData("gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg")]
    public void DriveKeyRejectsInvalidValues(string value)
    {
        Assert.False(DriveKey.TryCreate(value, out _));
    }

    [Theory]
    [InlineData(DriveContentTypeId.MovieValue)]
    [InlineData(DriveContentTypeId.SeriesValue)]
    [InlineData(DriveContentTypeId.MusicValue)]
    [InlineData(DriveContentTypeId.GenericValue)]
    public void ContentTypeAcceptsBuiltInValues(string value)
    {
        Assert.True(DriveContentTypeId.TryCreate(value, out var contentTypeId));
        Assert.Equal(value, contentTypeId.Value);
    }

    [Fact]
    public void ContentTypeRejectsUnregisteredValue()
    {
        Assert.False(DriveContentTypeId.TryCreate("com.example.comics", out _));
    }

    [Fact]
    public void DriveNameTrimsOuterWhitespace()
    {
        Assert.True(DriveName.TryCreate("  电影资料  ", out var name));
        Assert.Equal("电影资料", name.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void DriveNameRejectsBlankValue(string value)
    {
        Assert.False(DriveName.TryCreate(value, out _));
    }

    [Fact]
    public void IdempotencyKeyIsOpaqueAndStable()
    {
        const string value = "web:create-drive:01";

        Assert.True(IdempotencyKey.TryCreate(value, out var idempotencyKey));
        Assert.Equal(value, idempotencyKey.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("contains space")]
    [InlineData("contains\nnewline")]
    public void IdempotencyKeyRejectsInvalidValue(string value)
    {
        Assert.False(IdempotencyKey.TryCreate(value, out _));
    }
}
