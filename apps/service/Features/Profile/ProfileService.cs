using System.Text;
using System.Text.Json;
using CineReel.Service.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Profile;

public interface IProfileService
{
    Task<ProfileDto> GetAsync(string mainDriveKey, CancellationToken cancellationToken = default);
    Task<ProfileDto> UpdateAsync(string mainDriveKey, ProfileUpdateRequest request, CancellationToken cancellationToken = default);
    Task<ProfileDto> SaveAvatarAsync(string mainDriveKey, byte[] body, string contentType, CancellationToken cancellationToken = default);
}

public sealed class ProfileService : IProfileService
{
    private readonly IServiceProvider _services;
    private readonly IDomainEventBus _bus;
    private readonly ILogger<ProfileService> _logger;
    private readonly TimeProvider _clock;

    public ProfileService(IServiceProvider services, IDomainEventBus bus, ILogger<ProfileService> logger, TimeProvider? clock = null)
    {
        _services = services;
        _bus = bus;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    private IHyperAgentReadClient Reader =>
        _services.GetService(typeof(IHyperAgentReadClient)) as IHyperAgentReadClient
            ?? throw new InvalidOperationException("IHyperAgentReadClient not registered");

    private IHyperAgentWriteClient Writer =>
        _services.GetService(typeof(IHyperAgentWriteClient)) as IHyperAgentWriteClient
            ?? throw new InvalidOperationException("IHyperAgentWriteClient not registered");

    public async Task<ProfileDto> GetAsync(string mainDriveKey, CancellationToken cancellationToken = default)
    {
        var raw = await TryReadProfileAsync(mainDriveKey, cancellationToken);
        var collections = await ComputeCollectionsAsync(cancellationToken);
        return new ProfileDto(raw.Name, raw.Bio, raw.AvatarPath, raw.UpdatedAt, collections);
    }

    public async Task<ProfileDto> UpdateAsync(string mainDriveKey, ProfileUpdateRequest request, CancellationToken cancellationToken = default)
    {
        Validate(request.Name, request.Bio);
        var existing = await TryReadProfileAsync(mainDriveKey, cancellationToken);
        var now = _clock.GetUtcNow();
        var raw = new ProfileJson(request.Name, request.Bio, existing.AvatarPath, now);
        var body = JsonSerializer.SerializeToUtf8Bytes(raw, JsonOpts);
        await Writer.WriteFileAsync(mainDriveKey, "/profile.json", body, cancellationToken: cancellationToken);
        await _bus.PublishAsync(new ProfileUpdated(now), cancellationToken);
        var collections = await ComputeCollectionsAsync(cancellationToken);
        return new ProfileDto(raw.Name, raw.Bio, raw.AvatarPath, raw.UpdatedAt, collections);
    }

    public async Task<ProfileDto> SaveAvatarAsync(string mainDriveKey, byte[] body, string contentType, CancellationToken cancellationToken = default)
    {
        if (body.Length == 0) throw new ArgumentException("avatar body empty", nameof(body));
        var ext = contentType switch
        {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            _ => throw new ArgumentException($"unsupported content-type {contentType}", nameof(contentType)),
        };
        var existing = await TryReadProfileAsync(mainDriveKey, cancellationToken);
        var now = _clock.GetUtcNow();
        var avatarPath = $"/avatar.{ext}";
        await Writer.WriteFileAsync(mainDriveKey, avatarPath, body, cancellationToken: cancellationToken);
        var raw = new ProfileJson(existing.Name, existing.Bio, avatarPath, now);
        var profileBody = JsonSerializer.SerializeToUtf8Bytes(raw, JsonOpts);
        await Writer.WriteFileAsync(mainDriveKey, "/profile.json", profileBody, cancellationToken: cancellationToken);
        await _bus.PublishAsync(new ProfileUpdated(now), cancellationToken);
        var collections = await ComputeCollectionsAsync(cancellationToken);
        return new ProfileDto(raw.Name, raw.Bio, raw.AvatarPath, raw.UpdatedAt, collections);
    }

    private async Task<ProfileJson> TryReadProfileAsync(string mainDriveKey, CancellationToken cancellationToken)
    {
        try
        {
            var resp = await Reader.ReadFileAsync(mainDriveKey, "/profile.json", cancellationToken: cancellationToken);
            var json = JsonSerializer.Deserialize<ProfileJson>(resp.Body, JsonOpts);
            return json ?? new ProfileJson("", null, null, null);
        }
        catch (HyperAgentDriveNotMountedException)
        {
            return new ProfileJson("", null, null, null);
        }
        catch (HyperAgentException ex) when (ex.Message.Contains("not-found", StringComparison.OrdinalIgnoreCase))
        {
            return new ProfileJson("", null, null, null);
        }
    }

    private async Task<IReadOnlyList<CollectionDto>> ComputeCollectionsAsync(CancellationToken cancellationToken)
    {
        var drives = await Reader.ListDrivesAsync(cancellationToken);
        var collections = new List<CollectionDto>();
        foreach (var drive in drives)
        {
            try
            {
                var resp = await Reader.ReadFileAsync(drive.DriveKey, "/descriptor.json", cancellationToken: cancellationToken);
                using var doc = JsonDocument.Parse(resp.Body);
                var type = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
                if (type != "resource") continue;
                var name = doc.RootElement.TryGetProperty("name", out var n) ? n.GetString() ?? drive.DriveKey : drive.DriveKey;
                var createdAt = doc.RootElement.TryGetProperty("createdAt", out var c) && c.TryGetDateTimeOffset(out var dt) ? (DateTimeOffset?)dt : null;
                collections.Add(new CollectionDto(drive.DriveKey, name, createdAt, createdAt));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogDebug(ex, "collections: skipping drive {DriveKey}", drive.DriveKey);
            }
        }
        return collections;
    }

    private static void Validate(string name, string? bio)
    {
        if (string.IsNullOrEmpty(name) || name.Length > 64)
            throw new ArgumentException("name length must be 1..64", nameof(name));
        if (bio is not null && bio.Length > 1024)
            throw new ArgumentException("bio length must be ≤ 1024", nameof(bio));
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private sealed record ProfileJson(string Name, string? Bio, string? AvatarPath, DateTimeOffset? UpdatedAt);
}