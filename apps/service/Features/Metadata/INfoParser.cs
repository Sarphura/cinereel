using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Metadata;

public interface INfoParser
{
    /// <summary>
    /// Parse a Kodi-style <c>movie.nfo</c> stream. A root element that
    /// isn't <c>&lt;movie&gt;</c> raises a <see cref="DomainValidationException"/>
    /// with <c>{"root": ["must be &lt;movie&gt;"]}</c>. The <c>driveKey</c>
    /// and <c>drivePath</c> are forwarded into the exception payload so
    /// callers can correlate failures back to the subscription row.
    /// </summary>
    Task<ParsedNfo> ParseAsync(string driveKey, string drivePath, Stream stream, CancellationToken cancellationToken = default);
}
