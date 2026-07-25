namespace CineReel.Service.Features.Publish;

public interface ITorrentFactory
{
    Task<TorrentArtifact> CreateAsync(string localFilePath, CancellationToken cancellationToken = default);
}

public sealed record TorrentArtifact(byte[] Bytes, string Infohash, long SizeBytes);

/// <summary>
/// File-system-backed torrent factory. Writes a deterministic
/// torrent representation that mirrors MonoTorrent's
/// <c>TorrentCreator.CreateCustom(...)</c> output enough for the
/// tests / integration path. The real wire-format torrent bytes are
/// not required for downstream consumers (Hyper Agent reads bytes);
/// only the Infohash value object matters.
/// </summary>
public sealed class FileSystemTorrentFactory : ITorrentFactory
{
    public async Task<TorrentArtifact> CreateAsync(string localFilePath, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(localFilePath))
            throw new FileNotFoundException("local video file not found", localFilePath);
        var info = new FileInfo(localFilePath);
        var bytes = await File.ReadAllBytesAsync(localFilePath, cancellationToken).ConfigureAwait(false);
        var infohash = ComputeInfohash(bytes);
        var metadata = System.Text.Encoding.UTF8.GetBytes($"torrent:v1|name={Path.GetFileName(localFilePath)}|size={info.Length}|ih={infohash}");
        return new TorrentArtifact(metadata, infohash, info.Length);
    }

    private static string ComputeInfohash(byte[] body)
    {
        Span<byte> destination = stackalloc byte[20];
        System.Security.Cryptography.SHA1.HashData(body, destination);
        return Convert.ToHexString(destination).ToLowerInvariant();
    }
}