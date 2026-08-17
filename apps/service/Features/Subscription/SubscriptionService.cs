using System.Text.Json;
using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Subscription.Dto;
using CineReel.Service.Features.Subscription.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Subscription;

/// <summary>
/// Owns the subscription lifecycle: the create-from-drive and
/// create-from-profile flows, the listing/get/delete endpoints, and the
/// state machine transitions `Pending → Active/Failed`. Hyper Agent calls
/// go through the read/write halves so a Polly-style retry can wrap the
/// read side later.
/// </summary>
public sealed class SubscriptionService : ISubscriptionService
{
    private readonly ISubscriptionRepository _repository;
    private readonly IHyperAgentReadClient _reader;
    private readonly IHyperAgentWriteClient _writer;
    private readonly IDomainEventBus _bus;
    private readonly Func<DriveKey, bool> _isSelfDriveKey;
    private readonly ILogger<SubscriptionService> _logger;
    private readonly TimeProvider _clock;

    public SubscriptionService(
        ISubscriptionRepository repository,
        IHyperAgentReadClient reader,
        IHyperAgentWriteClient writer,
        IDomainEventBus bus,
        Func<DriveKey, bool> isSelfDriveKey,
        ILogger<SubscriptionService> logger,
        TimeProvider? clock = null)
    {
        _repository = repository;
        _reader = reader ?? throw new ArgumentNullException(nameof(reader));
        _writer = writer ?? throw new ArgumentNullException(nameof(writer));
        _bus = bus;
        _isSelfDriveKey = isSelfDriveKey;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<SubscriptionEntity> CreateFromDriveKeyAsync(string driveKeyRaw, string? alias, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(driveKeyRaw) || driveKeyRaw.Length != 64 || !IsHex(driveKeyRaw))
        {
            throw new SubscriptionServiceException(SubscriptionServiceException.InvalidDriveKey, "driveKey must be 64 lowercase hex characters");
        }

        var driveKey = new DriveKey(driveKeyRaw);
        if (await _repository.FindByDriveKeyAsync(driveKey, cancellationToken) is not null)
        {
            throw new SubscriptionServiceException(SubscriptionServiceException.Duplicate, "subscription already exists for this drive key");
        }

        MountResponse mount;
        try
        {
            mount = await _writer.MountRemoteDriveAsync(driveKey.Value, cancellationToken);
        }
        catch (HyperAgentDriveNotMountedException ex)
        {
            throw new SubscriptionServiceException(SubscriptionServiceException.DriveNotMounted, ex.Message);
        }
        catch (Exception ex)
        {
            throw new SubscriptionServiceException(SubscriptionServiceException.MountFailed, ex.Message);
        }

        var subscription = new SubscriptionEntity
        {
            DriveKey = mount.DriveKey,
            Alias = alias,
            State = SubscriptionState.Pending,
            SubscribedAt = _clock.GetUtcNow(),
        };

        var saved = await _repository.AddAsync(subscription, cancellationToken);
        await _bus.PublishAsync(new SubscriptionCreated(new SubscriptionId(saved.Id), new DriveKey(saved.DriveKey), saved.SubscribedAt), cancellationToken);
        return saved;
    }

    public async Task<ProfilePickerResponse> ListCollectionsForProfileAsync(string profileKeyRaw, CancellationToken cancellationToken = default)
    {
        EnsureValidKey(profileKeyRaw);
        try
        {
            await _reader.GetEntryAsync(profileKeyRaw, "/profile.json", cancellationToken: cancellationToken);
        }
        catch (HyperAgentDriveNotMountedException ex)
        {
            throw new SubscriptionServiceException(SubscriptionServiceException.DriveNotMounted, ex.Message);
        }

        // The Hyper Agent doesn't expose a typed /profile.json read yet —
        // we surface a static placeholder so the picker UI has something
        // to display when wiring the picker.
        return new ProfilePickerResponse(
            ProfileDriveKey: profileKeyRaw,
            PublisherName: "Publisher",
            Collections: new[]
            {
                new ProfilePickerEntry(profileKeyRaw, "Default collection", null),
            });
    }

    public async Task<SubscriptionEntity> CreateFromProfileKeyAsync(string profileKeyRaw, string driveKeyRaw, CancellationToken cancellationToken = default)
    {
        EnsureValidKey(profileKeyRaw);
        EnsureValidKey(driveKeyRaw);
        return await CreateFromDriveKeyAsync(driveKeyRaw, alias: profileKeyRaw, cancellationToken);
    }

    public async Task<IReadOnlyList<SubscriptionEntity>> ListAsync(CancellationToken cancellationToken = default)
    {
        return await _repository.ListAsync(cancellationToken);
    }

    public async Task<SubscriptionEntity?> GetAsync(SubscriptionId id, CancellationToken cancellationToken = default)
    {
        return await _repository.FindByIdAsync(id, cancellationToken);
    }

    public async Task<bool> DeleteAsync(SubscriptionId id, CancellationToken cancellationToken = default)
    {
        var existing = await _repository.FindByIdAsync(id, cancellationToken);
        if (existing is null) return false;

        try
        {
            await _writer.UnmountRemoteDriveAsync(existing.DriveKey, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "UnmountRemoteDriveAsync failed for subscription {Id} ({DriveKey}); continuing with delete",
                existing.Id, existing.DriveKey);
        }

        await _repository.RemoveAsync(id, cancellationToken);
        await _bus.PublishAsync(new SubscriptionDeleted(id, new DriveKey(existing.DriveKey), _clock.GetUtcNow()), cancellationToken);
        return true;
    }

    public async Task MarkFailedAsync(SubscriptionId id, string reason, CancellationToken cancellationToken = default)
    {
        var existing = await _repository.FindByIdAsync(id, cancellationToken);
        if (existing is null) return;
        existing.State = SubscriptionState.Failed;
        existing.FailureReason = reason;
    }

    public async Task MarkActiveAsync(SubscriptionId id, CancellationToken cancellationToken = default)
    {
        var existing = await _repository.FindByIdAsync(id, cancellationToken);
        if (existing is null) return;
        existing.State = SubscriptionState.Active;
        existing.LastDescriptorSeenAt = _clock.GetUtcNow();
    }

    public async Task<Dto.SubscriptionResponse> ToResponseAsync(SubscriptionEntity entity, CancellationToken cancellationToken = default)
    {
        var isSelf = _isSelfDriveKey(new DriveKey(entity.DriveKey));
        return SubscriptionResponseFactory.FromEntity(entity, isSelf);
    }

    private static void EnsureValidKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length != 64 || !IsHex(key))
        {
            throw new SubscriptionServiceException(SubscriptionServiceException.InvalidDriveKey, "driveKey must be 64 lowercase hex characters");
        }
    }

    private static bool IsHex(string value)
    {
        foreach (var c in value)
        {
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')))
                return false;
        }
        return true;
    }
}
