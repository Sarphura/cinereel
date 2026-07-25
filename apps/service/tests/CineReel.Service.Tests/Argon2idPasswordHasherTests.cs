using CineReel.Service.Features.Accounts;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class Argon2idPasswordHasherTests
{
    [Fact]
    public void Hash_and_verify_round_trip()
    {
        var hasher = new Argon2idPasswordHasher();
        var encoded = hasher.Hash("correct horse battery staple");
        Assert.True(hasher.Verify("correct horse battery staple", encoded));
        Assert.False(hasher.Verify("wrong password", encoded));
    }

    [Fact]
    public void Hash_changes_per_call_even_for_same_input()
    {
        var hasher = new Argon2idPasswordHasher();
        var a = hasher.Hash("password");
        var b = hasher.Hash("password");
        Assert.NotEqual(a, b);
    }
}
