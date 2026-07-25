using System.Text.Json;
using System.Text.Json.Serialization;

namespace CineReel.Service.Domain.Common;

[JsonConverter(typeof(SubscriptionIdJsonConverter))]
public readonly record struct SubscriptionId
{
    public SubscriptionId(int value)
    {
        if (value <= 0)
        {
            throw DomainValidationException.For("subscriptionId", "must be positive");
        }
        Value = value;
    }

    public int Value { get; }
    public override string ToString() => Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
}

public sealed class SubscriptionIdJsonConverter : JsonConverter<SubscriptionId>
{
    public override SubscriptionId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => new(reader.GetInt32());
    public override void Write(Utf8JsonWriter writer, SubscriptionId value, JsonSerializerOptions options) => writer.WriteNumberValue(value.Value);
}
