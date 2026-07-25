using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace CineReel.Service.Domain.Common;

[JsonConverter(typeof(DriveKeyJsonConverter))]
public readonly record struct DriveKey
{
    private static readonly Regex Pattern = new("^[0-9a-f]{64}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public DriveKey(string value)
    {
        if (value is null || !Pattern.IsMatch(value))
        {
            throw DomainValidationException.For("driveKey", "must be exactly 64 lowercase hexadecimal characters");
        }

        Value = value;
    }

    public string Value { get; }
    public override string ToString() => Value;
}

public sealed class DriveKeyJsonConverter : JsonConverter<DriveKey>
{
    public override DriveKey Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        new(reader.GetString() ?? string.Empty);

    public override void Write(Utf8JsonWriter writer, DriveKey value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.Value);
}
