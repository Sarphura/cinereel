using CineReel.Service.Features.Rbac;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class PermissionMatcherTests
{
    [Theory]
    [InlineData(new[] { "library:read" }, "library:read", true)]
    [InlineData(new[] { "publish:create" }, "publish:delete", false)]
    [InlineData(new[] { "publish:create" }, "publish:*", true)]
    [InlineData(new[] { "publish:create" }, "subscribe:*", false)]
    [InlineData(new[] { "*" }, "any:thing", true)]
    [InlineData(new string[0], "library:read", false)]
    public void Match_handles_patterns(string[] permissions, string required, bool expected)
    {
        Assert.Equal(expected, PermissionMatcher.Match(permissions, required));
    }
}
