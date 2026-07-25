using System.Security.Cryptography;
using System.Text;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Tier 2 fallback (ADR 0016) — produces a stable synthetic ID of the
/// form <c>local-</c> followed by 16 hex chars derived from
/// <c>sha256(driveKey || ':' || drivePath)</c>. The ID is identical
/// across re-publishes of the same (driveKey, drivePath) pair.
/// </summary>
public static class SyntheticIdGenerator
{
    public const string Prefix = "local-";

    public static string Generate(string driveKey, string drivePath)
    {
        if (string.IsNullOrEmpty(driveKey)) throw new ArgumentException("driveKey is required", nameof(driveKey));
        if (string.IsNullOrEmpty(drivePath)) throw new ArgumentException("drivePath is required", nameof(drivePath));

        var bytes = Encoding.UTF8.GetBytes($"{driveKey}:{drivePath}");
        var hash = SHA256.HashData(bytes);
        // 16 hex chars == 8 bytes.
        var hex = Convert.ToHexString(hash, 0, 8).ToLowerInvariant();
        return $"{Prefix}{hex}";
    }
}
