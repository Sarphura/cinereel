using System.Net;
using System.Net.Http.Headers;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Typed client surface for the Hyper Agent's HTTP API. This is the
/// hand-rolled version the Application Server uses today; ticket 14
/// will replace it with an NSwag-generated client whose interface
/// matches this shape. The interface methods carry the same names as
/// the future generated ones (e.g. <c>FilesRangeReadAsync</c>) so the
/// migration is mechanical.
/// </summary>
public interface IHyperAgentClient
{
    /// <summary>
    /// <c>GET /v1/version</c> — returns the Hyper Agent's reported
    /// identity. Used by <see cref="HyperAgentVersionProbe"/> on
    /// startup.
    /// </summary>
    Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken ct = default);

    /// <summary>
    /// <c>GET /healthz</c> — readiness signal polled by the App
    /// Server's spawn-watch loop.
    /// </summary>
    Task<bool> HealthAsync(CancellationToken ct = default);

    /// <summary>
    /// <c>GET /v1/files/:driveKey/*</c> with optional Range header.
    /// Replaces <c>driveReadFile</c> for trailer-byte ranged reads
    /// (ADR 0047). The response carries the requested byte slice and
    /// the trailing <c>Content-Range</c> header.
    /// </summary>
    Task<HyperAgentFileResponse> FilesRangeReadAsync(
        string driveKey,
        string path,
        long? rangeStart = null,
        long? rangeEnd = null,
        CancellationToken ct = default);

    /// <summary>
    /// Legacy <c>GET /v1/drives/:key/file?path=</c>. Used by poster /
    /// NFO / <c>.torrent</c> reads that do not need Range. Will be
    /// deleted in ticket 13 once the migration to
    /// <see cref="FilesRangeReadAsync"/> completes for all read paths.
    /// </summary>
    Task<byte[]> DriveReadFileAsync(
        string driveKey,
        string path,
        CancellationToken ct = default);
}

/// <summary>
/// Response wrapper for <see cref="IHyperAgentClient.FilesRangeReadAsync"/>.
/// The status code distinguishes 200 (full body) from 206 (partial);
    /// <see cref="ContentRange"/> carries the resolved slice.
/// </summary>
public sealed record HyperAgentFileResponse(
    HttpStatusCode StatusCode,
    string ContentType,
    long? ContentLength,
    string? ContentRange,
    byte[] Body);
