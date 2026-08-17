using System.Security.Cryptography;

namespace CineReel.Service.Features.Bootstrap;

/// <summary>
/// Generates a random alphanumeric password for the first-launch
/// bootstrap admin. 16 chars from the base62 alphabet —
/// readable on a printout, impossible to brute force against the
/// Argon2id hash in any reasonable time.
/// </summary>
public static class RandomPasswordGenerator
{
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    public static string Generate(int length = 16)
    {
        if (length <= 0) throw new ArgumentOutOfRangeException(nameof(length));
        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }
        return new string(chars);
    }
}