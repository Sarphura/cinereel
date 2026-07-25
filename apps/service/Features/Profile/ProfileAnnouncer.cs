using CineReel.Service.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Profile;

/// <summary>
/// Re-announces every local drive after a <see cref="ProfileUpdated"/>
/// event (ADR 0014). The local main drive and every resource drive
/// in the collection get one <c>AnnounceAsync(wait: true)</c> per
/// event so peers see the latest profile metadata.
/// </summary>
public sealed class ProfileAnnouncer : IDomainEventHandler<ProfileUpdated>
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ProfileAnnouncer> _logger;

    public ProfileAnnouncer(IServiceProvider services, ILogger<ProfileAnnouncer> logger)
    {
        _services = services;
        _logger = logger;
    }

    private IHyperAgentWriteClient? TryGetWriter() => _services.GetService(typeof(IHyperAgentWriteClient)) as IHyperAgentWriteClient;
    private IHyperAgentReadClient? TryGetReader() => _services.GetService(typeof(IHyperAgentReadClient)) as IHyperAgentReadClient;

    public async Task HandleAsync(ProfileUpdated evt, CancellationToken cancellationToken)
    {
        var writer = TryGetWriter();
        var reader = TryGetReader();
        if (writer is null || reader is null) return;
        try
        {
            var drives = await reader.ListDrivesAsync(cancellationToken);
            foreach (var drive in drives)
            {
                try { await writer.AnnounceAsync(wait: true, cancellationToken); }
                catch (Exception ex) { _logger.LogWarning(ex, "announce failed for {DriveKey}", drive.DriveKey); }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "profile announce enumeration failed");
        }
    }
}