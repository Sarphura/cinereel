namespace CineReel.Service.Features.Trailers;

/// <summary>
/// 1 GB default trailer cache. The cap and the eviction
/// floor are configurable per deployment. Test overrides pass an
/// in-memory filesystem via <see cref="ITrailerFileSystem"/>.
/// </summary>
public sealed class TrailerCacheOptions
{
    public string CacheRoot { get; set; } = "./trailers";
    public long MaxBytes { get; set; } = 1L * 1024 * 1024 * 1024;
    public long EvictUntilBytes { get; set; } = 800L * 1024 * 1024;
    public int MaintainIntervalSeconds { get; set; } = 300;
}

public interface ITrailerFileSystem
{
    bool Exists(string path);
    long Size(string path);
    DateTimeOffset LastAccessUtc(string path);
    void Touch(string path, DateTimeOffset when);
    byte[] ReadAllBytes(string path);
    Stream OpenRead(string path);
    void WriteAllBytes(string path, byte[] bytes);
    void Delete(string path);
    IEnumerable<string> EnumerateFiles(string folder);
    bool TryGetFreeBytes(string folder, out long freeBytes);
}

public sealed class LocalTrailerFileSystem : ITrailerFileSystem
{
    public bool Exists(string path) => File.Exists(path);
    public long Size(string path) => new FileInfo(path).Length;
    public DateTimeOffset LastAccessUtc(string path) => File.GetLastAccessTimeUtc(path);
    public void Touch(string path, DateTimeOffset when) { try { File.SetLastAccessTimeUtc(path, when.UtcDateTime); } catch { /* readonly fs */ } }
    public byte[] ReadAllBytes(string path) => File.ReadAllBytes(path);
    public Stream OpenRead(string path) => File.OpenRead(path);
    public void WriteAllBytes(string path, byte[] bytes) { Directory.CreateDirectory(Path.GetDirectoryName(path)!); File.WriteAllBytes(path, bytes); }
    public void Delete(string path) { if (File.Exists(path)) File.Delete(path); }
    public IEnumerable<string> EnumerateFiles(string folder) { if (Directory.Exists(folder)) foreach (var f in Directory.EnumerateFiles(folder)) yield return f; }
    public bool TryGetFreeBytes(string folder, out long freeBytes)
    {
        freeBytes = 0;
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(folder));
            if (string.IsNullOrEmpty(root)) return false;
            freeBytes = new DriveInfo(root).AvailableFreeSpace;
            return true;
        }
        catch { return false; }
    }
}