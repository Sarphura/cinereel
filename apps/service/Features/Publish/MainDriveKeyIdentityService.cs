using CineReel.Service.Features.Publish;
using CineReel.Service.Infrastructure.HyperAgent;

namespace CineReel.Service.Features.Publish;

/// <summary>
/// Default identity provider for the publish surface (ticket 31).
/// Resolves the local main drive key at call time via the Hyper
/// Agent identity endpoint. Production deployments should swap in
/// a cached implementation once the Hyper Agent emits a stable
/// identity token.
/// </summary>
public sealed class MainDriveKeyIdentityService : IIdentityService
{
    private readonly IServiceProvider _services;
    public MainDriveKeyIdentityService(IServiceProvider services) { _services = services; }

    public string GetMainDriveKey()
    {
        var client = _services.GetService(typeof(IHyperAgentReadClient)) as IHyperAgentReadClient;
        if (client is null) return string.Empty;
        return client.GetIdentityAsync().GetAwaiter().GetResult().MainDriveKey ?? string.Empty;
    }
}