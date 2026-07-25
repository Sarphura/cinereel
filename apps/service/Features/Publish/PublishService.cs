using System.Text;
using System.Text.Json;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Publish;

public interface IIdentityService
{
    string GetMainDriveKey();
}

public interface IPublishService
{
    Task<CreateDriveResponseDto> CreateDriveAsync(string name, string type, string mainDriveKey, CancellationToken cancellationToken = default);
    Task DeleteDriveAsync(string driveKey, string mainDriveKey, CancellationToken cancellationToken = default);
    Task AnnounceAsync(string driveKey, bool wait, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PeerInfoResponseDto>> GetPeersAsync(CancellationToken cancellationToken = default);
    Task<IdentityResponseDto> GetIdentityAsync(string mainDriveKey, CancellationToken cancellationToken = default);
}

public sealed class PublishService : IPublishService
{
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.Ordinal) { "metadata", "resource", "blob" };
    private readonly IHyperAgentReadClient _reader;
    private readonly IHyperAgentWriteClient _writer;
    private readonly ISubscriptionRepository _subscriptions;
    private readonly ILogger<PublishService> _logger;
    private readonly TimeProvider _clock;

    public PublishService(
        IHyperAgentReadClient reader,
        IHyperAgentWriteClient writer,
        ISubscriptionRepository subscriptions,
        ILogger<PublishService> logger,
        TimeProvider? clock = null)
    {
        _reader = reader ?? throw new ArgumentNullException(nameof(reader));
        _writer = writer ?? throw new ArgumentNullException(nameof(writer));
        _subscriptions = subscriptions;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<CreateDriveResponseDto> CreateDriveAsync(string name, string type, string mainDriveKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(name) || name.Length > 64)
            throw new PublishValidationException("invalid-input", "name length must be 1..64");
        if (!AllowedTypes.Contains(type))
            throw new PublishValidationException("invalid-input", $"type must be one of {string.Join(',', AllowedTypes)}");

        var drive = await _writer.CreateDriveAsync(name, type, cancellationToken);
        var createdAt = _clock.GetUtcNow();
        var descriptor = JsonSerializer.SerializeToUtf8Bytes(new
        {
            name,
            type,
            ownerProfileKey = mainDriveKey,
            createdAt = createdAt,
        }, JsonOpts);
        try
        {
            await _writer.WriteFileAsync(drive.DriveKey, "descriptor.json", descriptor, cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "descriptor write failed for {DriveKey}", drive.DriveKey);
        }

        var subscription = new Data.Entities.SubscriptionEntity
        {
            DriveKey = drive.DriveKey,
            Alias = name,
            State = Data.Entities.SubscriptionState.Active,
            SubscribedAt = createdAt,
        };
        try
        {
            await _subscriptions.AddAsync(subscription, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "subscription row insert failed for {DriveKey}", drive.DriveKey);
        }

        return new CreateDriveResponseDto(drive.DriveKey, drive.Name ?? name, drive.Type ?? type, createdAt);
    }

    public async Task DeleteDriveAsync(string driveKey, string mainDriveKey, CancellationToken cancellationToken = default)
    {
        if (string.Equals(driveKey, mainDriveKey, StringComparison.Ordinal))
            throw new PublishConflictException("cannot-delete-main-drive", "refusing to delete the main drive");
        var existing = await _subscriptions.FindByDriveKeyAsync(new DriveKey(driveKey), cancellationToken);
        await _writer.UnmountRemoteDriveAsync(driveKey, cancellationToken);
        if (existing is not null)
            await _subscriptions.RemoveAsync(new SubscriptionId(existing.Id), cancellationToken);
    }

    public Task AnnounceAsync(string driveKey, bool wait, CancellationToken cancellationToken = default) =>
        _writer.AnnounceAsync(wait, cancellationToken);

    public async Task<IReadOnlyList<PeerInfoResponseDto>> GetPeersAsync(CancellationToken cancellationToken = default)
    {
        var peers = await _reader.GetPeersAsync(cancellationToken);
        return peers.Select(p => new PeerInfoResponseDto(p.PublicKey ?? string.Empty, p.ConnectedAt, p.RemoteAddress)).ToList();
    }

    public async Task<IdentityResponseDto> GetIdentityAsync(string mainDriveKey, CancellationToken cancellationToken = default)
    {
        var info = await _reader.GetIdentityAsync(cancellationToken);
        var peers = await GetPeersAsync(cancellationToken);
        return new IdentityResponseDto(mainDriveKey, info.MainDriveKey ?? string.Empty, info.SwarmPort, peers.Count);
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
}