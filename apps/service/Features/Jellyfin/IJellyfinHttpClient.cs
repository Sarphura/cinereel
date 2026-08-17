namespace CineReel.Service.Features.Jellyfin;

/// <summary>
/// HTTP / file-system boundary for Jellyfin pushes.
/// The default implementation writes to a configured local
/// <c>Jellyfin:LibraryRoot</c>; tests inject a fake that captures the
/// writes. The HTTP endpoint used by the real Jellyfin server is
/// <c>POST /Library/Media/Updated</c>.
/// </summary>
public interface IJellyfinHttpClient
{
    Task PushFilesAsync(string folder, IReadOnlyDictionary<string, byte[]> files, CancellationToken cancellationToken = default);
    Task RemoveFolderAsync(string folder, CancellationToken cancellationToken = default);
}

public sealed class LocalJellyfinHttpClient : IJellyfinHttpClient
{
    private readonly string _libraryRoot;

    public LocalJellyfinHttpClient(string libraryRoot)
    {
        _libraryRoot = libraryRoot;
    }

    public async Task PushFilesAsync(string folder, IReadOnlyDictionary<string, byte[]> files, CancellationToken cancellationToken = default)
    {
        var dir = Path.Combine(_libraryRoot, folder);
        Directory.CreateDirectory(dir);
        foreach (var (name, body) in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await File.WriteAllBytesAsync(Path.Combine(dir, name), body, cancellationToken).ConfigureAwait(false);
        }
    }

    public Task RemoveFolderAsync(string folder, CancellationToken cancellationToken = default)
    {
        var dir = Path.Combine(_libraryRoot, folder);
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        return Task.CompletedTask;
    }
}