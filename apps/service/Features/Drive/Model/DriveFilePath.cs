namespace Cinereel.Features.Drive;

public readonly record struct DriveFilePath
{
    public const int MaxLength = 1024;

    private DriveFilePath(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out DriveFilePath path)
    {
        if (IsValidAbsolutePath(value, allowRoot: false))
        {
            path = new DriveFilePath(value!);
            return true;
        }

        path = default;
        return false;
    }

    internal static bool IsValidAbsolutePath(string? value, bool allowRoot)
    {
        if (value is not { Length: > 0 and <= MaxLength } || value[0] != '/')
        {
            return false;
        }

        if (value == "/")
        {
            return allowRoot;
        }

        if (value.Length < 2 || value[^1] == '/' || HasInvalidCharacter(value))
        {
            return false;
        }

        return value[1..]
            .Split('/')
            .All(IsValidSegment);
    }

    internal static bool IsValidSegment(string value)
    {
        return value.Length is > 0 and <= MaxLength &&
            value is not "." and not ".." &&
            !value.Contains('/') &&
            !HasInvalidCharacter(value);
    }

    public override string ToString() => Value;

    private static bool HasInvalidCharacter(string value)
    {
        for (var index = 0; index < value.Length; index++)
        {
            var character = value[index];
            if (character == '\\' || character is <= '\u001f' or '\u007f')
            {
                return true;
            }

            if (!char.IsSurrogate(character))
            {
                continue;
            }

            if (!char.IsHighSurrogate(character) ||
                index + 1 >= value.Length ||
                !char.IsLowSurrogate(value[index + 1]))
            {
                return true;
            }

            index++;
        }

        return false;
    }
}
