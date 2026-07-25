using System.Text.Json;
using System.Text.Json.Serialization;

namespace CineReel.Service.Domain.Common;

[JsonConverter(typeof(TorrentPathJsonConverter))]
public readonly record struct TorrentPath
{
    public TorrentPath(string value)
    {
        Value = RelativeDrivePath.Validate(value, "torrentPath");
    }
    public string Value { get; }
    public override string ToString() => Value;
}

public sealed class TorrentPathJsonConverter : JsonConverter<TorrentPath>
{
    public override TorrentPath Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => new(reader.GetString() ?? string.Empty);
    public override void Write(Utf8JsonWriter writer, TorrentPath value, JsonSerializerOptions options) => writer.WriteStringValue(value.Value);
}
