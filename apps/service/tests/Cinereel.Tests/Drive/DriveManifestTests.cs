using System.Text;
using System.Text.Json;
using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveManifestTests
{
    private const string ValidJson = """
        {"schemaVersion":1,"name":"电影收藏","contentTypeId":"cinereel.movie","description":"公开说明","createdAt":"2026-09-05T08:00:00.123Z","updatedAt":"2026-09-05T08:00:00.123Z"}
        """;

    [Fact]
    public void SupportedDocumentRoundTripsOnlyPublicFields()
    {
        var result = DriveManifest.Parse(Encoding.UTF8.GetBytes(ValidJson));

        Assert.Equal(ReadDriveManifestResultCode.Success, result.ResultCode);
        var manifest = Assert.IsType<DriveManifest>(result.Manifest);
        Assert.False(manifest.HasUnknownFields);
        var serialized = manifest.Serialize();
        Assert.False(serialized.AsSpan().StartsWith(Encoding.UTF8.Preamble));
        var roundTrip = DriveManifest.Parse(serialized);
        Assert.Equal(manifest, roundTrip.Manifest);
        using var document = JsonDocument.Parse(serialized);
        Assert.Equal(6, document.RootElement.EnumerateObject().Count());
        Assert.Equal("2026-09-05T08:00:00.123Z",
            document.RootElement.GetProperty("updatedAt").GetString());
    }

    [Theory]
    [InlineData("schemaVersion", "null")]
    [InlineData("schemaVersion", "1.0")]
    [InlineData("schemaVersion", "\"1\"")]
    [InlineData("name", "null")]
    [InlineData("name", "\"  \"")]
    [InlineData("description", "null")]
    [InlineData("contentTypeId", "false")]
    [InlineData("createdAt", "\"2026-09-05T08:00:00Z\"")]
    [InlineData("createdAt", "\"2026-09-05T08:00:00.123+00:00\"")]
    [InlineData("createdAt", "\"2026-09-05t08:00:00.123z\"")]
    [InlineData("createdAt", "\"2026-02-30T08:00:00.123Z\"")]
    [InlineData("updatedAt", "\"2026-09-05T07:59:59.999Z\"")]
    public void RejectsInvalidRequiredFields(string field, string rawValue)
    {
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(ReplaceField(field, rawValue)).ResultCode);
    }

    [Theory]
    [InlineData("schemaVersion")]
    [InlineData("name")]
    [InlineData("contentTypeId")]
    [InlineData("description")]
    [InlineData("createdAt")]
    [InlineData("updatedAt")]
    public void RejectsMissingRequiredFields(string field)
    {
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(ReplaceField(field, null)).ResultCode);
    }

    [Fact]
    public void DistinguishesUnsupportedSchemaAndContentType()
    {
        Assert.Equal(ReadDriveManifestResultCode.UnsupportedSchema,
            DriveManifest.Parse(ReplaceField("schemaVersion", "2")).ResultCode);
        Assert.Equal(ReadDriveManifestResultCode.UnsupportedContentType,
            DriveManifest.Parse(ReplaceField("contentTypeId", "\"cinereel.future\"")).ResultCode);
    }

    [Theory]
    [InlineData("{\"schemaVersion\":1,\"schemaVersion\":1}")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("{} {}")]
    [InlineData("{\"schemaVersion\":1,}")]
    [InlineData("{\"schemaVersion\":/* comment */1}")]
    public void RejectsInvalidDocumentShape(string json)
    {
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(Encoding.UTF8.GetBytes(json)).ResultCode);
    }

    [Theory]
    [InlineData("\"\\uD800\"")]
    [InlineData("\"\\uDC00\"")]
    [InlineData("\"\\uD800x\"")]
    [InlineData("\"\\uD800\\u0041\"")]
    [InlineData("{\"duplicate\":0,\"dup\\u006cicate\":1}")]
    [InlineData("{\"\\uD800\":0}")]
    public void ValidatesUnknownFieldsAndUnicodeEscapes(string rawValue)
    {
        var content = Encoding.UTF8.GetBytes(ValidJson[..^1] + ",\"extra\":" + rawValue + "}");
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(content).ResultCode);
    }

    [Fact]
    public void RejectsInvalidUtf8AndBom()
    {
        var valid = Encoding.UTF8.GetBytes(ValidJson);
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse((byte[])[.. Encoding.UTF8.Preamble, .. valid]).ResultCode);
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(new byte[] { 0xC0, 0xAF }).ResultCode);
    }

    [Fact]
    public void UnknownFieldsAreReadableButCannotBeSerializedBack()
    {
        var content = Encoding.UTF8.GetBytes(
            ValidJson[..^1] + ",\"extra\":{\"name\":\"\\uD83D\\uDE00\"}}");
        var result = DriveManifest.Parse(content);
        Assert.Equal(ReadDriveManifestResultCode.Success, result.ResultCode);
        var manifest = Assert.IsType<DriveManifest>(result.Manifest);
        Assert.True(manifest.HasUnknownFields);
        Assert.Throws<ArgumentException>(() => manifest.Serialize());
    }

    [Fact]
    public void EnforcesByteAndDepthLimitsIncludingUnknownFields()
    {
        var exactlyLimit = Encoding.UTF8.GetBytes(ValidJson.PadRight(DriveManifest.MaxByteLength -
            Encoding.UTF8.GetByteCount(ValidJson) + ValidJson.Length));
        Assert.Equal(ReadDriveManifestResultCode.Success, DriveManifest.Parse(exactlyLimit).ResultCode);
        Assert.Equal(ReadDriveManifestResultCode.TooLarge,
            DriveManifest.Parse((byte[])[.. exactlyLimit, (byte)' ']).ResultCode);
        var deeplyNested = Encoding.UTF8.GetBytes(ValidJson[..^1] + ",\"extra\":" +
            new string('[', 16) + "0" + new string(']', 16) + "}");
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(deeplyNested).ResultCode);
    }

    [Fact]
    public void NormalizesNameAndUsesUtf16LengthLimits()
    {
        Assert.Equal("电影收藏", DriveManifest.Parse(ReplaceField("name", "\"  电影收藏  \""))
            .Manifest?.Name);
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(ReplaceField("name", JsonSerializer.Serialize(new string('a', 201))))
                .ResultCode);
        Assert.Equal(ReadDriveManifestResultCode.Success,
            DriveManifest.Parse(ReplaceField("description", JsonSerializer.Serialize(new string('a', 4000))))
                .ResultCode);
        Assert.Equal(ReadDriveManifestResultCode.Invalid,
            DriveManifest.Parse(ReplaceField("description", JsonSerializer.Serialize(new string('a', 4001))))
                .ResultCode);
    }

    [Fact]
    public void SerializationRejectsInvalidInMemoryUnicode()
    {
        var manifest = DriveManifest.Parse(Encoding.UTF8.GetBytes(ValidJson)).Manifest!;
        Assert.Throws<ArgumentException>(() => (manifest with { Description = "\uD800" }).Serialize());
        Assert.Throws<ArgumentException>(() => (manifest with { Name = "\uDC00" }).Serialize());
    }

    [Fact]
    public void SerializationEmitsUtcMilliseconds()
    {
        var manifest = DriveManifest.Parse(Encoding.UTF8.GetBytes(ValidJson)).Manifest!;
        var date = new DateTimeOffset(2026, 9, 5, 16, 0, 0, 123, TimeSpan.FromHours(8));
        using var document = JsonDocument.Parse((manifest with { CreatedAt = date, UpdatedAt = date }).Serialize());
        Assert.Equal("2026-09-05T08:00:00.123Z",
            document.RootElement.GetProperty("createdAt").GetString());
    }

    private static byte[] ReplaceField(string field, string? rawValue)
    {
        using var document = JsonDocument.Parse(ValidJson);
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Name != field)
                {
                    property.WriteTo(writer);
                }
                else if (rawValue is not null)
                {
                    writer.WritePropertyName(field);
                    writer.WriteRawValue(rawValue);
                }
            }

            writer.WriteEndObject();
        }

        return stream.ToArray();
    }
}
