using System.Text.Json;
using System.Text.Json.Serialization;

namespace CineReel.Service.Domain.Common;

[JsonConverter(typeof(MediaItemIdJsonConverter))]
public readonly record struct MediaItemId
{
    public MediaItemId(int value)
    {
        if (value <= 0)
        {
            throw DomainValidationException.For("mediaItemId", "must be positive");
        }
        Value = value;
    }

    public int Value { get; }
    public override string ToString() => Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
}

public sealed class MediaItemIdJsonConverter : JsonConverter<MediaItemId>
{
    public override MediaItemId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => new(reader.GetInt32());
    public override void Write(Utf8JsonWriter writer, MediaItemId value, JsonSerializerOptions options) => writer.WriteNumberValue(value.Value);
}
