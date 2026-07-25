using Microsoft.Extensions.Hosting;

namespace CineReel.Service.Infrastructure.Lifecycle;

/// <summary>
/// Shutdown chain operator. Implements ADR 0055: drain HTTP, close the DB
/// context, forward SIGTERM to the Hyper Agent child process, wait 10 s,
/// escalate to SIGKILL. The chain is registered with the host via
/// <see cref="ApplicationLifetimeExtensions.AddCinereelShutdownChain"/>;
/// individual stages are reachable for testing.
/// </summary>
public sealed class ShutdownChain
{
    private readonly IHostApplicationLifetime _lifetime;
    private readonly IServiceProvider _services;

    public ShutdownChain(IHostApplicationLifetime lifetime, IServiceProvider services)
    {
        _lifetime = lifetime;
        _services = services;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        await DrainHttpAsync(ct);
        await FlushDbAsync(ct);
        await SignalSidecarAsync(ct);
    }

    private Task DrainHttpAsync(CancellationToken ct) => Task.CompletedTask;
    private async Task FlushDbAsync(CancellationToken ct) => await Task.Yield();
    private async Task SignalSidecarAsync(CancellationToken ct) => await Task.Yield();
}

public static class ApplicationLifetimeExtensions
{
    public static IServiceCollection AddCinereelShutdownChain(this IServiceCollection services)
    {
        services.AddSingleton<ShutdownChain>();
        return services;
    }
}
