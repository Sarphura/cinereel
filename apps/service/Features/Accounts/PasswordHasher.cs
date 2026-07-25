using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;

namespace CineReel.Service.Features.Accounts;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string encoded);
}

public sealed class Argon2idPasswordHasher : IPasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int DegreeOfParallelism = 4;
    private const int MemorySizeKb = 64 * 1024;
    private const int Iterations = 3;

    public string Hash(string password)
    {
        if (string.IsNullOrEmpty(password)) throw new ArgumentException("password must be non-empty", nameof(password));
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = ComputeKey(password, salt);
        return $"argon2id$v=19$m={MemorySizeKb},t={Iterations},p={DegreeOfParallelism}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    public bool Verify(string password, string encoded)
    {
        if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(encoded)) return false;
        var parts = encoded.Split('$');
        if (parts.Length is not 5 || parts[0] != "argon2id") return false;
        var parameters = ParseParameters(parts[2]);
        var salt = Convert.FromBase64String(parts[3]);
        var expected = Convert.FromBase64String(parts[4]);
        var actual = ComputeKey(password, salt, parameters.MemoryKb, parameters.Iterations, parameters.Parallelism, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private static byte[] ComputeKey(string password, byte[] salt, int? memoryKb = null, int? iterations = null, int? parallelism = null, int? keySize = null)
    {
        using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(password))
        {
            Salt = salt,
            DegreeOfParallelism = parallelism ?? DegreeOfParallelism,
            MemorySize = memoryKb ?? MemorySizeKb,
            Iterations = iterations ?? Iterations,
        };
        return argon2.GetBytes(keySize ?? KeySize);
    }

    private static (int MemoryKb, int Iterations, int Parallelism) ParseParameters(string segment)
    {
        int memory = MemorySizeKb, iterations = Iterations, parallelism = DegreeOfParallelism;
        foreach (var pair in segment.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            if (kv.Length != 2) continue;
            switch (kv[0])
            {
                case "m": memory = int.Parse(kv[1], System.Globalization.CultureInfo.InvariantCulture); break;
                case "t": iterations = int.Parse(kv[1], System.Globalization.CultureInfo.InvariantCulture); break;
                case "p": parallelism = int.Parse(kv[1], System.Globalization.CultureInfo.InvariantCulture); break;
            }
        }
        return (memory, iterations, parallelism);
    }
}
