namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Marker alias for the Hyper Agent read client so that
/// <c>TrailerCache</c> doesn't have to take a hard dependency on
/// <c>Infrastructure.HyperAgent</c>. Resolved through DI.
/// </summary>
public interface IHyperAgentReadClientSurface :
    Infrastructure.HyperAgent.IHyperAgentReadClient
{
}