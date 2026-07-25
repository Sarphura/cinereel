using System.ComponentModel.DataAnnotations;

namespace CineReel.Service.Infrastructure.Settings;

public sealed class CinereelOptions
{
    public const string SectionName = "CinereelOptions";

    [Required] public string DataDir { get; set; } = string.Empty;
    [Range(1, 65535)] public int SidecarPort { get; set; } = 4201;

    public WebOptions Web { get; set; } = new();
    public HyperAgentOptions HyperAgent { get; set; } = new();
    public DatabaseOptions Database { get; set; } = new();
    public BtOptions Bt { get; set; } = new();
    public JellyfinOptions Jellyfin { get; set; } = new();
    public TmdbOptions Tmdb { get; set; } = new();
}

public sealed class WebOptions
{
    [Required] public string ListenHost { get; set; } = "127.0.0.1";
    [Range(1, 65535)] public int ListenPort { get; set; } = 8090;
}

public sealed class HyperAgentOptions
{
    [Required] public string BaseUrl { get; set; } = "http://127.0.0.1:4201";
    public string? TokenFile { get; set; }
}

public sealed class DatabaseOptions
{
    public string Path { get; set; } = "cinereel.db";
}

public sealed class BtOptions
{
    public string? StagingDir { get; set; }
    [Range(0, long.MaxValue)] public long MaxDiskBytes { get; set; } = 50L * 1024 * 1024 * 1024;
    [Range(0, long.MaxValue)] public long MaxBandwidthBytesPerSec { get; set; } = 0;
}

public sealed class JellyfinOptions
{
    public string? Url { get; set; }
    public string? ApiKey { get; set; }
}

public sealed class TmdbOptions
{
    public string? ApiKey { get; set; }
}
