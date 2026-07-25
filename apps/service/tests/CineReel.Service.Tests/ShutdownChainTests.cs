using CineReel.Service.Infrastructure.Lifecycle;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace CineReel.Service.Infrastructure.Lifecycle.Tests;

public sealed class ShutdownChainTests
{
    [Fact]
    public async Task RunAsync_completes_without_throwing()
    {
        var chain = new ShutdownChain(
            lifetime: new FakeLifetime(),
            services: new EmptyServiceProvider());

        await chain.RunAsync(CancellationToken.None);
    }

    private sealed class FakeLifetime : IHostApplicationLifetime
    {
        public CancellationToken ApplicationStarted => CancellationToken.None;
        public CancellationToken ApplicationStopping => CancellationToken.None;
        public CancellationToken ApplicationStopped => CancellationToken.None;
        public void StopApplication() { }
    }

    private sealed class EmptyServiceProvider : IServiceProvider
    {
        public object? GetService(Type serviceType) => null;
    }
}
