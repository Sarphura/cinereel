using System.Buffers.Binary;
using System.Text;

namespace Cinereel.Features.Drive;

public readonly record struct DriveDirectoryCursor
{
    private const int VersionLength = sizeof(long);
    private const int MaxEncodedLength = 4120;
    private static readonly UTF8Encoding Utf8 = new(
        encoderShouldEmitUTF8Identifier: false,
        throwOnInvalidBytes: true);

    private DriveDirectoryCursor(string value, long driveVersion, string childName)
    {
        Value = value;
        DriveVersion = driveVersion;
        ChildName = childName;
    }

    public string Value { get; }

    internal long DriveVersion { get; }

    internal string ChildName { get; }

    public static bool TryParse(string? value, out DriveDirectoryCursor cursor)
    {
        cursor = default;

        if (value is not { Length: > 0 and <= MaxEncodedLength } ||
            value.Contains('=') ||
            value.Any(character => !char.IsAsciiLetterOrDigit(character) &&
                character is not '-' and not '_'))
        {
            return false;
        }

        byte[] payload;

        try
        {
            payload = Decode(value);
        }
        catch (FormatException)
        {
            return false;
        }

        if (payload.Length <= VersionLength || !string.Equals(
                Encode(payload),
                value,
                StringComparison.Ordinal))
        {
            return false;
        }

        var driveVersion = BinaryPrimitives.ReadInt64BigEndian(payload);

        if (driveVersion < 0)
        {
            return false;
        }

        string childName;

        try
        {
            childName = Utf8.GetString(payload.AsSpan(VersionLength));
        }
        catch (DecoderFallbackException)
        {
            return false;
        }

        if (!DriveFilePath.IsValidSegment(childName))
        {
            return false;
        }

        cursor = new DriveDirectoryCursor(value, driveVersion, childName);
        return true;
    }

    internal static DriveDirectoryCursor Create(long driveVersion, string childName)
    {
        if (driveVersion < 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(driveVersion),
                "Drive 版本不能为负数。");
        }

        if (!DriveFilePath.IsValidSegment(childName))
        {
            throw new ArgumentException(
                "childName 必须是有效的目录子项名称。",
                nameof(childName));
        }

        var childNameBytes = Utf8.GetBytes(childName);
        var payload = new byte[VersionLength + childNameBytes.Length];
        BinaryPrimitives.WriteInt64BigEndian(payload, driveVersion);
        childNameBytes.CopyTo(payload, VersionLength);
        var value = Encode(payload);
        return new DriveDirectoryCursor(value, driveVersion, childName);
    }

    public override string ToString() => Value;

    private static string Encode(ReadOnlySpan<byte> payload)
    {
        return Convert.ToBase64String(payload)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[] Decode(string value)
    {
        var base64 = value
            .Replace('-', '+')
            .Replace('_', '/');
        var paddingLength = (4 - (base64.Length % 4)) % 4;

        if (paddingLength > 0)
        {
            base64 += new string('=', paddingLength);
        }

        return Convert.FromBase64String(base64);
    }
}
