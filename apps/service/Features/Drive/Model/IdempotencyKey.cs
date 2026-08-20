namespace Cinereel.Features.Drive;

public readonly record struct IdempotencyKey
{
    public const int MaxLength = 128;

    private IdempotencyKey(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out IdempotencyKey idempotencyKey)
    {
        if (value is { Length: > 0 and <= MaxLength } && value.All(IsVisibleAscii))
        {
            idempotencyKey = new IdempotencyKey(value);
            return true;
        }

        idempotencyKey = default;
        return false;
    }

    public override string ToString() => Value;

    private static bool IsVisibleAscii(char value) => value is >= '!' and <= '~';
}
