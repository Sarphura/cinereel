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
    private readonly IHyperAgentReadClient _reader;
    public MainDriveKeyIdentityService(IHyperAgentReadClient reader) { _reader = reader ?? throw new ArgumentNullException(nameof(reader)); }

    public string GetMainDriveKey()
    {
        return _reader.GetIdentityAsync().GetAwaiter().GetResult().MainDriveKey ?? string.Empty;
    }
}