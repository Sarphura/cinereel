using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Metadata;
using CineReel.Service.Features.Metadata.Events;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class MetadataScannerTests
{
    private const string DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task First_scan_emits_MediaItemAdded()
    {
        var (scanner, subscribers, _, _) = await BuildScanner();
        await scanner.ScanAsync(new SubscriptionId(1));
        Assert.NotEmpty(subscribers.Added);
    }

    [Fact]
    public async Task Rescan_with_unchanged_descriptor_emits_no_added()
    {
        var (scanner, subscribers, _, _) = await BuildScanner();
        await scanner.ScanAsync(new SubscriptionId(1));
        var firstCount = subscribers.Added.Count;
        await scanner.ScanAsync(new SubscriptionId(1));
        Assert.Equal(firstCount, subscribers.Added.Count);
    }

    [Fact]
    public async Task Descriptor_hash_change_emits_SubscriptionDescriptorChanged()
    {
        var (scanner, subscribers, _, client) = await BuildScanner();
        await scanner.ScanAsync(new SubscriptionId(1));

        client.DescriptorBody = """{"version":2}""";

        await scanner.ScanAsync(new SubscriptionId(1));

        Assert.NotEmpty(subscribers.Changes);
    }

    private static async Task<(IMetadataScanner Scanner, CollectingHandler Bus, InMemoryMediaItemRepository Media, ScannerStubHyperAgent Client)> BuildScanner()
    {
        var subsRepo = new InMemorySubscriptionRepository();
        await subsRepo.AddAsync(new SubscriptionEntity { Id = 1, DriveKey = DriveKey, State = SubscriptionState.Active, SubscribedAt = Now });
        var mediaRepo = new InMemoryMediaItemRepository();
        var bus = new ScannerRecordingBus();
        var subscribers = new CollectingHandler(bus);
        var client = new ScannerStubHyperAgent();
        var parser = new ScannerStubNfoParser();
        var resolver = new ScannerStubIMDbResolver();
        var scanner = new MetadataScanner(subsRepo, mediaRepo, client, parser, resolver, bus, NullLogger<MetadataScanner>.Instance, ScannerFakeTimeProvider.Instance);
        return (scanner, subscribers, mediaRepo, client);
    }
}

internal sealed class ScannerStubHyperAgent : IHyperAgentReadClient
{
    public string DescriptorBody { get; set; } = """{"version":1}""";
    public string NfoBody { get; set; } = """<?xml version="1.0"?><movie><title>The Scan Test</title><imdbid>tt0000001</imdbid><year>2020</year></movie>""";

    private static readonly TreeNode Tree = new("movies", "directory", null, new[]
    {
        new TreeNode("OriginalMovie", "directory", null, null),
    });

    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new HyperAgentVersionResponse("test", "0.0.0"));
    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) => Task.FromResult<HyperdriveEntry?>(null);
    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) => Task.FromResult(Tree);
    public Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default)
    {
        if (path.EndsWith("descriptor.json", StringComparison.Ordinal))
            return Task.FromResult(new HyperAgentFileResponse(System.Net.HttpStatusCode.OK, "application/json", null, null, System.Text.Encoding.UTF8.GetBytes(DescriptorBody)));
        if (path.EndsWith("movie.nfo", StringComparison.Ordinal))
            return Task.FromResult(new HyperAgentFileResponse(System.Net.HttpStatusCode.OK, "application/xml", null, null, System.Text.Encoding.UTF8.GetBytes(NfoBody)));
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 404, "not-found");
    }
    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
}

internal sealed class ScannerStubNfoParser : INfoParser
{
    public Task<ParsedNfo> ParseAsync(string driveKey, string drivePath, Stream stream, CancellationToken cancellationToken = default)
    {
        var xml = """<?xml version="1.0"?><movie><title>The Scan Test</title><imdbid>tt0000001</imdbid><year>2020</year></movie>""";
        using var s = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(xml));
        var doc = System.Xml.Linq.XDocument.Load(s);
        var root = doc.Root!;
        var title = (string?)root.Element("title") ?? "Title";
        return Task.FromResult(new ParsedNfo(title, null, 2020, "tt0000001", null, null, [], [], [], [], null, null, null, null, [], NfoRawFields.Empty));
    }
}

internal sealed class ScannerStubIMDbResolver : IIMDBResolver
{
    public Task<ResolvedID> ResolveAsync(ParsedNfo parsedNfo, string driveKey, string drivePath, CancellationToken cancellationToken = default)
        => Task.FromResult(new ResolvedID(parsedNfo.ImdbId ?? "tt0000001", IDKind.Direct));
}

internal sealed class ScannerRecordingBus : IDomainEventBus
{
    public Action<IDomainEvent>? Subscribers { get; set; }
    public Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default) where TEvent : IDomainEvent
    {
        Subscribers?.Invoke(evt);
        return Task.CompletedTask;
    }
}

internal sealed class CollectingHandler
{
    public CollectingHandler(IDomainEventBus bus)
    {
        var rb = (ScannerRecordingBus)bus;
        Added = new List<MediaItemAdded>();
        Changes = new List<SubscriptionDescriptorChanged>();
        rb.Subscribers = evt =>
        {
            switch (evt)
            {
                case MediaItemAdded m: Added.Add(m); break;
                case SubscriptionDescriptorChanged s: Changes.Add(s); break;
            }
        };
    }
    public List<MediaItemAdded> Added { get; }
    public List<SubscriptionDescriptorChanged> Changes { get; }
}

internal sealed class ScannerFakeTimeProvider : TimeProvider
{
    public static readonly ScannerFakeTimeProvider Instance = new();
    public override DateTimeOffset GetUtcNow() => new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
}
