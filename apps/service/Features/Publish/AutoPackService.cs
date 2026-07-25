using System.Text;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Publish;

public interface IAutoPackService
{
    Task<AutoPackResponse> PackAsync(AutoPackRequest request, CancellationToken cancellationToken = default);
}

public sealed class AutoPackService : IAutoPackService
{
    private readonly ITorrentFactory _torrentFactory;
    private readonly IServiceProvider _services;
    private readonly ILogger<AutoPackService> _logger;
    private readonly TimeProvider _clock;

    public AutoPackService(ITorrentFactory torrentFactory, IServiceProvider services, ILogger<AutoPackService> logger, TimeProvider? clock = null)
    {
        _torrentFactory = torrentFactory;
        _services = services;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    private IHyperAgentWriteClient Writer =>
        _services.GetService(typeof(IHyperAgentWriteClient)) as IHyperAgentWriteClient
            ?? throw new InvalidOperationException("IHyperAgentWriteClient not registered");

    public async Task<AutoPackResponse> PackAsync(AutoPackRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.LocalVideoPath) || !File.Exists(request.LocalVideoPath))
            throw new AutoPackValidationException("invalid-input", "local video file not found");
        if (string.IsNullOrWhiteSpace(request.DriveName))
            throw new AutoPackValidationException("invalid-input", "drive name required");

        TorrentArtifact torrent;
        try
        {
            torrent = await _torrentFactory.CreateAsync(request.LocalVideoPath, cancellationToken);
        }
        catch (FileNotFoundException)
        {
            throw new AutoPackValidationException("invalid-input", "local video file not found");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "torrent creation failed");
            throw new AutoPackUnavailableException("bt-engine-unavailable", "torrent creation failed");
        }

        var drive = await Writer.CreateDriveAsync(request.DriveName, "metadata", cancellationToken);
        var createdAt = _clock.GetUtcNow();
        try
        {
            await Writer.WriteFileAsync(drive.DriveKey, "descriptor.json", BuildDescriptor(request, createdAt), cancellationToken: cancellationToken);
            await Writer.WriteFileAsync(drive.DriveKey, "movie.nfo", BuildNfo(request), cancellationToken: cancellationToken);
            if (!string.IsNullOrEmpty(request.PosterPath) && File.Exists(request.PosterPath))
            {
                var poster = await File.ReadAllBytesAsync(request.PosterPath, cancellationToken);
                await Writer.WriteFileAsync(drive.DriveKey, "poster.jpg", poster, cancellationToken: cancellationToken);
            }
            await Writer.WriteFileAsync(drive.DriveKey, "movie.torrent", torrent.Bytes, cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "auto-pack partial failure; rolling back drive {DriveKey}", drive.DriveKey);
            try { await Writer.DeleteFileAsync(drive.DriveKey, "/", recursive: true, cancellationToken: cancellationToken); } catch { /* best effort */ }
            throw;
        }

        return new AutoPackResponse(drive.DriveKey, torrent.Infohash, torrent.SizeBytes, createdAt);
    }

    private static byte[] BuildDescriptor(AutoPackRequest req, DateTimeOffset when)
    {
        var payload = $$"""{"name":"{{Escape(req.DriveName)}}","type":"metadata","ownerProfileKey":"main","createdAt":"{{when:O}}"}""";
        return Encoding.UTF8.GetBytes(payload);
    }

    private static byte[] BuildNfo(AutoPackRequest req)
    {
        var year = req.NfoYear.HasValue ? req.NfoYear.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) : string.Empty;
        var imdb = req.ImdbId ?? string.Empty;
        var payload = $"""<?xml version="1.0"?><movie><title>{Escape(req.NfoTitle)}</title><year>{year}</year><imdbid>{imdb}</imdbid></movie>""";
        return Encoding.UTF8.GetBytes(payload);
    }

    private static string Escape(string s) => s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
}

public sealed class AutoPackValidationException : Exception
{
    public string Code { get; }
    public AutoPackValidationException(string code, string message) : base(message) { Code = code; }
}

public sealed class AutoPackUnavailableException : Exception
{
    public string Code { get; }
    public AutoPackUnavailableException(string code, string message) : base(message) { Code = code; }
}