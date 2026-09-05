using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveManifestServiceTests
{
    [Fact]
    public async Task ReadsUsingOnlyDriveKeyAndReturnsActualRemoteVersion()
    {
        var client = new TestHyperClient();
        var driveKey = CreateDriveKey();
        var manifest = CreateManifest();
        client.SetProtocolFile(driveKey, manifest.Serialize());
        var service = new DriveManifestService(client);

        var result = await service.ReadAsync(driveKey, CancellationToken.None);

        Assert.Equal(ReadDriveManifestResultCode.Success, result.ResultCode);
        Assert.Equal(manifest, result.Manifest);
        Assert.Equal(client.GetProtocolFile(driveKey).ETag, result.ETag);
        Assert.Equal(client.GetProtocolFile(driveKey).DriveVersion, result.DriveVersion);
        var call = Assert.Single(client.ReadProtocolFileCalls);
        Assert.Equal(driveKey, call.DriveKey);
        Assert.Equal(DriveManifest.Path, call.Path.Value);
        Assert.Empty(client.CreateCalls);
    }

    [Theory]
    [InlineData((int)HyperReadProtocolFileResultCode.NotFound, (int)ReadDriveManifestResultCode.NotFound)]
    [InlineData((int)HyperReadProtocolFileResultCode.InvalidTarget, (int)ReadDriveManifestResultCode.Invalid)]
    [InlineData((int)HyperReadProtocolFileResultCode.TooLarge, (int)ReadDriveManifestResultCode.TooLarge)]
    [InlineData((int)HyperReadProtocolFileResultCode.Unavailable, (int)ReadDriveManifestResultCode.Unavailable)]
    [InlineData((int)HyperReadProtocolFileResultCode.Timeout, (int)ReadDriveManifestResultCode.Timeout)]
    public async Task ReadMapsRemoteBranches(int remoteCode, int expectedCode)
    {
        var client = new TestHyperClient { ReadProtocolFileResult = new((HyperReadProtocolFileResultCode)remoteCode) };
        var result = await new DriveManifestService(client).ReadAsync(CreateDriveKey(), CancellationToken.None);
        Assert.Equal((ReadDriveManifestResultCode)expectedCode, result.ResultCode);
    }

    [Theory]
    [InlineData((int)HyperWriteProtocolFileResultCode.Conflict, (int)WriteDriveManifestResultCode.Conflict)]
    [InlineData((int)HyperWriteProtocolFileResultCode.NotWritable, (int)WriteDriveManifestResultCode.NotWritable)]
    [InlineData((int)HyperWriteProtocolFileResultCode.TargetConflict, (int)WriteDriveManifestResultCode.TargetConflict)]
    [InlineData((int)HyperWriteProtocolFileResultCode.TooLarge, (int)WriteDriveManifestResultCode.TooLarge)]
    [InlineData((int)HyperWriteProtocolFileResultCode.Unavailable, (int)WriteDriveManifestResultCode.Unavailable)]
    [InlineData((int)HyperWriteProtocolFileResultCode.Timeout, (int)WriteDriveManifestResultCode.Timeout)]
    public async Task WriteMapsRemoteBranches(int remoteCode, int expectedCode)
    {
        var client = new TestHyperClient { WriteProtocolFileResult = new((HyperWriteProtocolFileResultCode)remoteCode) };
        var result = await new DriveManifestService(client).WriteAsync(
            CreateDriveKey(), CreateManifest(), null, CancellationToken.None);
        Assert.Equal((WriteDriveManifestResultCode)expectedCode, result.ResultCode);
    }

    [Fact]
    public async Task WriteUsesCallerConditionWithoutReadingAndPreservesNewerContent()
    {
        var client = new TestHyperClient();
        var driveKey = CreateDriveKey();
        var service = new DriveManifestService(client);
        var initial = CreateManifest();
        Assert.Equal(WriteDriveManifestResultCode.Written,
            (await service.WriteAsync(driveKey, initial, null, CancellationToken.None)).ResultCode);
        var firstETag = client.GetProtocolFile(driveKey).ETag;
        var latest = initial with { Name = "新描述" };
        Assert.Equal(WriteDriveManifestResultCode.Written,
            (await service.WriteAsync(driveKey, latest, firstETag, CancellationToken.None)).ResultCode);
        Assert.Equal(WriteDriveManifestResultCode.Conflict,
            (await service.WriteAsync(driveKey, initial, firstETag, CancellationToken.None)).ResultCode);
        Assert.Equal(WriteDriveManifestResultCode.Conflict,
            (await service.WriteAsync(driveKey, initial, null, CancellationToken.None)).ResultCode);
        Assert.Equal(latest, DriveManifest.Parse(client.GetProtocolFile(driveKey).Content!).Manifest);
        Assert.Empty(client.ReadProtocolFileCalls);
    }

    [Fact]
    public async Task InvalidAndUnknownFieldsNeverReachHyperClient()
    {
        var client = new TestHyperClient();
        var service = new DriveManifestService(client);
        Assert.Equal(WriteDriveManifestResultCode.Invalid,
            (await service.WriteAsync(CreateDriveKey(), CreateManifest() with { Name = "" },
                null, CancellationToken.None)).ResultCode);
        Assert.Equal(WriteDriveManifestResultCode.UnknownFields,
            (await service.WriteAsync(CreateDriveKey(), CreateManifest() with { HasUnknownFields = true },
                null, CancellationToken.None)).ResultCode);
        Assert.Empty(client.WriteProtocolFileCalls);
    }

    [Fact]
    public async Task CallerCancellationPropagatesAndTransportTimeoutIsDistinguished()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var client = new TestHyperClient();
        var service = new DriveManifestService(client);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.ReadAsync(
            CreateDriveKey(), cancellation.Token));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.WriteAsync(
            CreateDriveKey(), CreateManifest(), null, cancellation.Token));
        client.ReadProtocolFileException = new OperationCanceledException();
        client.WriteProtocolFileException = new OperationCanceledException();
        Assert.Equal(ReadDriveManifestResultCode.Timeout,
            (await service.ReadAsync(CreateDriveKey(), CancellationToken.None)).ResultCode);
        Assert.Equal(WriteDriveManifestResultCode.Timeout,
            (await service.WriteAsync(CreateDriveKey(), CreateManifest(), null, CancellationToken.None)).ResultCode);
    }

    [Fact]
    public async Task NetworkFailureDoesNotMasqueradeAsInvalidDocument()
    {
        var client = new TestHyperClient
        {
            ReadProtocolFileException = new HttpRequestException(),
            WriteProtocolFileException = new IOException()
        };
        var service = new DriveManifestService(client);
        Assert.Equal(ReadDriveManifestResultCode.Unavailable,
            (await service.ReadAsync(CreateDriveKey(), CancellationToken.None)).ResultCode);
        Assert.Equal(WriteDriveManifestResultCode.Unavailable,
            (await service.WriteAsync(CreateDriveKey(), CreateManifest(), null, CancellationToken.None)).ResultCode);
    }

    private static DriveKey CreateDriveKey()
    {
        Assert.True(DriveKey.TryCreate(new string('a', 64), out var key));
        return key;
    }

    private static DriveManifest CreateManifest()
    {
        var timestamp = new DateTimeOffset(2026, 9, 5, 8, 0, 0, TimeSpan.Zero);
        return new(1, "电影收藏", DriveContentTypeId.MovieValue, "公开说明", timestamp, timestamp);
    }
}
