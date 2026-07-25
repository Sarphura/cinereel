using System.Collections.Concurrent;
using Xunit;

namespace CineReel.Service.Infrastructure.Logging.Tests;

public sealed class RotatingFileLoggerProviderTests
{
    [Fact]
    public void Writes_to_dated_file_and_prunes_old_files()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"cine-logs-{Guid.NewGuid():N}");
        try
        {
            var clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-07-23T08:00:00Z"));
            using (var provider = new RotatingFileLoggerProvider(directory, clock, TimeSpan.FromDays(14)))
            {
                provider.Write(clock.GetUtcNow(), "Cinereel.Test", Microsoft.Extensions.Logging.LogLevel.Information, "first");
                clock.Set(clock.GetUtcNow().AddDays(15));
                provider.Write(clock.GetUtcNow(), "Cinereel.Test", Microsoft.Extensions.Logging.LogLevel.Information, "after-rotation");
            }
            var files = Directory.GetFiles(directory);
            Assert.DoesNotContain(files, path => Path.GetFileName(path) == "cinereel.2026-07-23.log");
            Assert.Contains(files, path => Path.GetFileName(path) == "cinereel.2026-08-07.log");
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private sealed class MutableTimeProvider(DateTimeOffset initial) : TimeProvider
    {
        private DateTimeOffset _now = initial;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Set(DateTimeOffset value) => _now = value;
    }
}
