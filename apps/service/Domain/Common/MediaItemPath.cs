using System.Text.Json;
using System.Text.Json.Serialization;

namespace CineReel.Service.Domain.Common;

[JsonConverter(typeof(MediaItemPathJsonConverter))]
public readonly record struct MediaItemPath
{
    public MediaItemPath(string value)
    {
        Value = RelativeDrivePath.Validate(value, "mediaItemPath");
    }
    public string Value { get; }
    public override string ToString() => Value;
}

public sealed class MediaItemPathJsonConverter : JsonConverter<MediaItemPath>
{
    public override MediaItemPath Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => new(reader.GetString() ?? string.Empty);
    public override void Write(Utf8JsonWriter writer, MediaItemPath value, JsonSerializerOptions options) => writer.WriteStringValue(value.Value);
}

internal static class RelativeDrivePath
{
    internal static string Validate(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value) || value.StartsWith('/') || value.Split('/').Any(part => part is "." or ".."))
        {
            throw DomainValidationException.For(field, "must be a safe drive-relative path");
        }
        return value;
    }
}
