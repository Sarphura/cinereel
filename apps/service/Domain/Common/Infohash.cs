using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace CineReel.Service.Domain.Common;

[JsonConverter(typeof(InfohashJsonConverter))]
public readonly record struct Infohash
{
    private static readonly Regex Pattern = new("^[0-9a-f]{40}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public Infohash(string value)
    {
        if (value is null || !Pattern.IsMatch(value))
        {
            throw DomainValidationException.For("infohash", "must be exactly 40 lowercase hexadecimal characters");
        }

        Value = value;
    }

    public string Value { get; }
    public override string ToString() => Value;
}

public sealed class InfohashJsonConverter : JsonConverter<Infohash>
{
    public override Infohash Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        new(reader.GetString() ?? string.Empty);

    public override void Write(Utf8JsonWriter writer, Infohash value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.Value);
}
