using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Jellyfin;
using CineReel.Service.Features.Metadata;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class JellyfinPusherTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Sanitize_replaces_invalid_chars()
    {
        Assert.Equal("AC-DC", JellyfinFolderName.Sanitize("AC/DC"));
        Assert.Equal("What-", JellyfinFolderName.Sanitize("What?"));
        Assert.Equal("hello-world-", JellyfinFolderName.Sanitize("hello:world*"));
    }

    [Fact]
    public void Build_returns_title_year_imdb_tag()
    {
        var folder = JellyfinFolderName.Build("The Matrix", 1999, "tt0133093");
        Assert.Equal("The Matrix (1999) {imdb-tt0133093}", folder);
    }

    [Fact]
    public void BuildLocal_returns_title_year_local_tag()
    {
        var folder = JellyfinFolderName.BuildLocal("Unknown", 2020, "local-abcd1234ef567890");
        Assert.Equal("Unknown (2020) {local-abcd1234ef567890}", folder);
    }

    [Fact]
    public async Task Push_writes_files_and_marks_pushed()
    {
        var http = new FakeJellyfinHttpClient();
        var repo = new InMemoryMediaItemRepository();
        var item = await SeedMediaItem(repo);
        var pusher = NewPusher(http, repo);

        var outcome = await pusher.PushAsync(item);

        Assert.Equal(JellyfinPushOutcome.Pushed, outcome);
        Assert.True(http.WriteCalls.Count > 0);
        var saved = (await repo.ListBySubscriptionAsync(new SubscriptionId(1))).Single();
        Assert.Equal(JellyfinState.Pushed, saved.JellyfinState);
        Assert.NotNull(saved.JellyfinPath);
    }

    [Fact]
    public async Task Push_failure_marks_failed()
    {
        var http = new FakeJellyfinHttpClient { ThrowOnPush = true };
        var repo = new InMemoryMediaItemRepository();
        var item = await SeedMediaItem(repo);
        var pusher = NewPusher(http, repo);

        var outcome = await pusher.PushAsync(item);

        Assert.Equal(JellyfinPushOutcome.Failed, outcome);
        var saved = (await repo.ListBySubscriptionAsync(new SubscriptionId(1))).Single();
        Assert.Equal(JellyfinState.Failed, saved.JellyfinState);
    }

    [Fact]
    public async Task Cross_folder_pushes_run_in_parallel()
    {
        var http = new FakeJellyfinHttpClient();
        var repo = new InMemoryMediaItemRepository();
        var itemA = await SeedMediaItem(repo, folder: "/A", title: "Alpha");
        var itemB = await SeedMediaItem(repo, folder: "/B", title: "Beta");
        var pusher = NewPusher(http, repo);

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var taskA = pusher.PushAsync(itemA);
        var taskB = pusher.PushAsync(itemB);
        await Task.WhenAll(taskA, taskB);
        stopwatch.Stop();

        // Each push takes ~50ms; serialised this would be ≥100ms; in parallel it is ≤90ms.
        Assert.True(stopwatch.ElapsedMilliseconds <= 90, $"expected concurrent push but elapsed={stopwatch.ElapsedMilliseconds}ms");
    }

    [Fact]
    public async Task Remove_clears_jellyfin_path()
    {
        var http = new FakeJellyfinHttpClient();
        var repo = new InMemoryMediaItemRepository();
        var item = await SeedMediaItem(repo);
        var pusher = NewPusher(http, repo);
        await pusher.PushAsync(item);

        var saved = (await repo.ListBySubscriptionAsync(new SubscriptionId(1))).Single();
        await pusher.RemoveAsync(saved);

        var after = (await repo.ListBySubscriptionAsync(new SubscriptionId(1))).Single();
        Assert.Equal(JellyfinState.Pending, after.JellyfinState);
        Assert.Null(after.JellyfinPath);
    }

    private static async Task<MediaItemEntity> SeedMediaItem(InMemoryMediaItemRepository repo, string folder = "/movies/Movie", string title = "The Movie")
    {
        var item = new MediaItemEntity
        {
            Id = 1,
            SubscriptionId = 1,
            DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            DrivePath = folder,
            DescriptorHash = "h",
            ImdbId = "tt0000001",
            Title = title,
            Year = 2020,
            Kind = MediaItemKind.Movie,
            PosterPath = "/poster.jpg",
            NfoPath = "/movie.nfo",
            TorrentPath = "/movie.torrent",
            CreatedAt = Now,
            UpdatedAt = Now,
        };
        await repo.UpsertAsync(item);
        return item;
    }

    private static JellyfinPusher NewPusher(IJellyfinHttpClient http, InMemoryMediaItemRepository repo)
    {
        return new JellyfinPusher(http, repo, new StubReaderProvider(), NullLogger<JellyfinPusher>.Instance, StubPusherTime.Instance);
    }
}

internal sealed class FakeJellyfinHttpClient : IJellyfinHttpClient
{
    public bool ThrowOnPush { get; set; }
    public List<(string Folder, Dictionary<string, byte[]> Files)> WriteCalls { get; } = new();
    public List<string> RemoveCalls { get; } = new();

    public Task PushFilesAsync(string folder, IReadOnlyDictionary<string, byte[]> files, CancellationToken cancellationToken = default)
    {
        if (ThrowOnPush) throw new IOException("simulated");
        WriteCalls.Add((folder, new Dictionary<string, byte[]>(files)));
        return Task.Delay(50, cancellationToken);
    }

    public Task RemoveFolderAsync(string folder, CancellationToken cancellationToken = default)
    {
        RemoveCalls.Add(folder);
        return Task.CompletedTask;
    }
}

internal sealed class StubReaderProvider : IServiceProvider
{
    public object? GetService(Type serviceType)
    {
        if (serviceType == typeof(IHyperAgentReadClient)) return new StubPusherHyperAgent();
        return null;
    }
}

internal sealed class StubPusherHyperAgent : IHyperAgentReadClient
{
    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) => Task.FromResult(new HyperAgentVersionResponse("test", "0.0.0"));
    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) => Task.FromResult<HyperdriveEntry?>(null);
    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default) =>
        Task.FromResult(new HyperAgentFileResponse(System.Net.HttpStatusCode.OK, "application/octet-stream", null, null, [0x00]));
    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
}

internal sealed class StubPusherTime : TimeProvider
{
    public static readonly StubPusherTime Instance = new();
    public override DateTimeOffset GetUtcNow() => new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
}