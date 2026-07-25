using System.Security.Cryptography;
using System.Text;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Computes the canonical SHA-256 descriptor hash for a remote
/// drive. The scanner stores this on every <c>media_items</c> row
/// (the <c>descriptor_hash</c> column from ADR 0008) so a later
/// re-scan can short-circuit when the publisher hasn't touched the
/// drive.
/// </summary>
public static class DescriptorHashComputer
{
    public static string ComputeHash(ReadOnlySpan<byte> body)
    {
        Span<byte> destination = stackalloc byte[32];
        SHA256.HashData(body, destination);
        return Convert.ToHexString(destination).ToLowerInvariant();
    }

    public static string ComputeHash(string body) => ComputeHash(Encoding.UTF8.GetBytes(body));

    public static string ComputeDescriptorHash(string driveKey, ReadOnlySpan<byte> body)
    {
        // Concatenate driveKey (origin identifier) with the body so
        // a publisher publishing identical payloads to two different
        // drives does not collide.
        var prefix = Encoding.UTF8.GetBytes($"{driveKey}:");
        Span<byte> buffer = stackalloc byte[prefix.Length + body.Length];
        prefix.CopyTo(buffer);
        body.CopyTo(buffer[prefix.Length..]);
        return ComputeHash(buffer);
    }
}
