using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Cinereel.Features.Drive;

internal sealed record DriveManifest(
    int SchemaVersion,
    string Name,
    string ContentTypeId,
    string Description,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool HasUnknownFields = false)
{
    internal const string Path = "/.cinereel/drive.json";
    internal const int CurrentSchemaVersion = 1;
    internal const int MaxByteLength = 64 * 1024;
    internal const int MaxDescriptionLength = 4000;
    private const string TimestampFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private static readonly HashSet<string> KnownFields = new(StringComparer.Ordinal)
    {
        "schemaVersion", "name", "contentTypeId", "description", "createdAt", "updatedAt"
    };

    internal static ReadDriveManifestResult Parse(ReadOnlyMemory<byte> content)
    {
        if (content.Length > MaxByteLength)
        {
            return new(ReadDriveManifestResultCode.TooLarge);
        }

        try
        {
            _ = StrictUtf8.GetString(content.Span);
            using var document = JsonDocument.Parse(content, new JsonDocumentOptions
            {
                MaxDepth = 16,
                AllowTrailingCommas = false,
                CommentHandling = JsonCommentHandling.Disallow
            });
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !HasValidProperties(root) || !HasValidEscapedUnicode(content.Span))
            {
                return new(ReadDriveManifestResultCode.Invalid);
            }

            if (!root.TryGetProperty("schemaVersion", out var schema) ||
                schema.ValueKind != JsonValueKind.Number ||
                !schema.TryGetInt32(out var schemaVersion))
            {
                return new(ReadDriveManifestResultCode.Invalid);
            }

            if (schemaVersion != CurrentSchemaVersion)
            {
                return new(ReadDriveManifestResultCode.UnsupportedSchema);
            }

            if (!TryReadString(root, "name", out var name) ||
                !DriveName.TryCreate(name, out var normalizedName) ||
                !TryReadString(root, "contentTypeId", out var contentTypeId) ||
                !TryReadString(root, "description", out var description) ||
                description.Length > MaxDescriptionLength ||
                !TryReadTimestamp(root, "createdAt", out var createdAt) ||
                !TryReadTimestamp(root, "updatedAt", out var updatedAt) ||
                updatedAt < createdAt)
            {
                return new(ReadDriveManifestResultCode.Invalid);
            }

            if (!DriveContentTypeId.TryCreate(contentTypeId, out _))
            {
                return new(ReadDriveManifestResultCode.UnsupportedContentType);
            }

            var manifest = new DriveManifest(
                schemaVersion,
                normalizedName.Value,
                contentTypeId,
                description,
                createdAt,
                updatedAt,
                root.EnumerateObject().Any(property => !KnownFields.Contains(property.Name)));
            return new(ReadDriveManifestResultCode.Success, manifest);
        }
        catch (Exception exception) when (exception is
            JsonException or DecoderFallbackException or InvalidOperationException)
        {
            return new(ReadDriveManifestResultCode.Invalid);
        }
    }

    internal byte[] Serialize()
    {
        if (SchemaVersion != CurrentSchemaVersion || HasUnknownFields ||
            !DriveName.TryCreate(Name, out var name) ||
            !DriveContentTypeId.TryCreate(ContentTypeId, out _) ||
            Description is null || Description.Length > MaxDescriptionLength ||
            !IsValidUnicode(Name) || !IsValidUnicode(Description) ||
            UpdatedAt < CreatedAt)
        {
            throw new ArgumentException("DriveManifest 包含无效或不支持写回的字段。");
        }

        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteNumber("schemaVersion", SchemaVersion);
            writer.WriteString("name", name.Value);
            writer.WriteString("contentTypeId", ContentTypeId);
            writer.WriteString("description", Description);
            writer.WriteString("createdAt", CreatedAt.ToUniversalTime().ToString(
                TimestampFormat, CultureInfo.InvariantCulture));
            writer.WriteString("updatedAt", UpdatedAt.ToUniversalTime().ToString(
                TimestampFormat, CultureInfo.InvariantCulture));
            writer.WriteEndObject();
        }

        return stream.ToArray();
    }

    private static bool HasValidProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name) || !HasValidProperties(property.Value))
                {
                    return false;
                }
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                if (!HasValidProperties(item))
                {
                    return false;
                }
            }
        }

        return true;
    }

    private static bool HasValidEscapedUnicode(ReadOnlySpan<byte> content)
    {
        var reader = new Utf8JsonReader(content, new JsonReaderOptions { MaxDepth = 16 });
        while (reader.Read())
        {
            if (reader.TokenType is not (JsonTokenType.String or JsonTokenType.PropertyName))
            {
                continue;
            }

            var value = reader.ValueSpan;
            for (var index = 0; index < value.Length; index++)
            {
                if (value[index] != '\\')
                {
                    continue;
                }

                if (value[++index] != 'u')
                {
                    continue;
                }

                var codeUnit = ReadEscapedCodeUnit(value.Slice(index + 1, 4));
                index += 4;
                if (char.IsLowSurrogate(codeUnit))
                {
                    return false;
                }

                if (!char.IsHighSurrogate(codeUnit))
                {
                    continue;
                }

                // JSON 语法允许单独的代理转义；协议要求它紧接低代理转义。
                if (index + 6 >= value.Length || value[index + 1] != '\\' ||
                    value[index + 2] != 'u' ||
                    !char.IsLowSurrogate(ReadEscapedCodeUnit(value.Slice(index + 3, 4))))
                {
                    return false;
                }

                index += 6;
            }
        }

        return true;
    }

    private static char ReadEscapedCodeUnit(ReadOnlySpan<byte> digits)
    {
        var value = 0;
        foreach (var digit in digits)
        {
            value = (value << 4) + (digit switch
            {
                >= (byte)'0' and <= (byte)'9' => digit - '0',
                >= (byte)'a' and <= (byte)'f' => digit - 'a' + 10,
                _ => digit - 'A' + 10
            });
        }

        return (char)value;
    }

    private static bool IsValidUnicode(string value)
    {
        try
        {
            _ = StrictUtf8.GetByteCount(value);
            return true;
        }
        catch (EncoderFallbackException)
        {
            return false;
        }
    }

    private static bool TryReadString(JsonElement root, string field, out string value)
    {
        value = string.Empty;
        if (!root.TryGetProperty(field, out var property) ||
            property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = property.GetString()!;
        return true;
    }

    private static bool TryReadTimestamp(
        JsonElement root, string field, out DateTimeOffset timestamp)
    {
        timestamp = default;
        return TryReadString(root, field, out var value) && value.Length == 24 &&
            DateTimeOffset.TryParseExact(
                value,
                TimestampFormat,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out timestamp);
    }
}
