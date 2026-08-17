using CineReel.Service.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Profile;

/// <summary>
/// Re-announces every local drive after a <see cref="ProfileUpdated"/>
/// event. The local main drive and every resource drive
/// in the collection get one <c>AnnounceAsync(wait: true)</c> per
/// event so peers see the latest profile metadata.
/// </summary>
public sealed class ProfileAnnouncer : IDomainEventHandler<ProfileUpdated>
{
    private readonly IHyperAgentWriteClient? _writer;
    private readonly IHyperAgentReadClient? _reader;
    private readonly ILogger<ProfileAnnouncer> _logger;

    public ProfileAnnouncer(IHyperAgentWriteClient? writer, IHyperAgentReadClient? reader, ILogger<ProfileAnnouncer> logger)
    {
        _writer = writer;
        _reader = reader;
        _logger = logger;
    }

    public async Task HandleAsync(ProfileUpdated evt, CancellationToken cancellationToken)
    {
        if (_writer is null || _reader is null) return;
        try
        {
            var drives = await _reader.ListDrivesAsync(cancellationToken);
            foreach (var drive in drives)
            {
                try { await _writer.AnnounceAsync(wait: true, cancellationToken); }
                catch (Exception ex) { _logger.LogWarning(ex, "announce failed for {DriveKey}", drive.DriveKey); }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "profile announce enumeration failed");
        }
    }
}