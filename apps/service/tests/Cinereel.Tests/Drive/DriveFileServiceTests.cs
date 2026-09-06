using System.Buffers.Binary;
using Ardalis.Result;
using Cinereel.Features.Drive;
using Cinereel.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveFileServiceTests
{
    [Fact]
    public void FilePathAcceptsCanonicalAbsolutePath()
    {
        Assert.True(DriveFilePath.TryCreate("/电影/正片.mkv", out var path));
        Assert.Equal("/电影/正片.mkv", path.Value);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("/")]
    [InlineData("relative/file.mkv")]
    [InlineData("/trailing/")]
    [InlineData("/double//separator")]
    [InlineData("/./file.mkv")]
    [InlineData("/../file.mkv")]
    [InlineData("/back\\slash")]
    [InlineData("/control\u0001character")]
    public void FilePathRejectsNonCanonicalPath(string? value)
    {
        Assert.False(DriveFilePath.TryCreate(value, out _));
    }

    [Fact]
    public void FilePathEnforcesWholePathLengthLimit()
    {
        var maximumPath = "/" + new string('a', DriveFilePath.MaxLength - 1);
        var oversizedPath = maximumPath + "b";

        Assert.True(DriveFilePath.TryCreate(maximumPath, out _));
        Assert.False(DriveFilePath.TryCreate(oversizedPath, out _));
    }

    [Fact]
    public void FilePathMatchesHyperControlCharacterRange()
    {
        Assert.False(DriveFilePath.TryCreate("/delete\u007f.txt", out _));
        Assert.True(DriveFilePath.TryCreate("/next-line\u0085.txt", out _));
    }

    [Fact]
    public void FilePathRejectsIsolatedUnicodeSurrogates()
    {
        Assert.False(DriveFilePath.TryCreate("/high-\uD800.txt", out _));
        Assert.False(DriveFilePath.TryCreate("/low-\uDC00.txt", out _));
    }

    [Fact]
    public void FilePathAcceptsUnicodeScalarPairAndReplacementCharacter()
    {
        Assert.True(DriveFilePath.TryCreate("/pair-\uD83D\uDE00.txt", out _));
        Assert.True(DriveFilePath.TryCreate("/replacement-\uFFFD.txt", out _));
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/电影")]
    [InlineData("/电影/花絮")]
    public void DirectoryPathAcceptsRootAndCanonicalAbsolutePath(string value)
    {
        Assert.True(DriveDirectoryPath.TryCreate(value, out var path));
        Assert.Equal(value, path.Value);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("relative")]
    [InlineData("/trailing/")]
    [InlineData("/double//separator")]
    [InlineData("/../parent")]
    public void DirectoryPathRejectsNonCanonicalPath(string? value)
    {
        Assert.False(DriveDirectoryPath.TryCreate(value, out _));
    }

    [Fact]
    public void DirectoryPathRejectsIsolatedUnicodeSurrogates()
    {
        Assert.False(DriveDirectoryPath.TryCreate("/high-\uD800", out _));
        Assert.False(DriveDirectoryPath.TryCreate("/low-\uDC00", out _));
    }

    [Fact]
    public void DirectoryPathAcceptsUnicodeScalarPairAndReplacementCharacter()
    {
        Assert.True(DriveDirectoryPath.TryCreate("/pair-\uD83D\uDE00", out _));
        Assert.True(DriveDirectoryPath.TryCreate("/replacement-\uFFFD", out _));
    }

    [Fact]
    public void DirectoryCursorRoundTripsVersionAndUnicodeChildName()
    {
        var cursor = DriveDirectoryCursor.Create(42, "正片.mkv");

        Assert.True(DriveDirectoryCursor.TryParse(cursor.Value, out var parsed));
        Assert.Equal(cursor.Value, parsed.Value);
        Assert.Equal(42, parsed.DriveVersion);
        Assert.Equal("正片.mkv", parsed.ChildName);
    }

    [Fact]
    public void DirectoryCursorRejectsNegativeVersionAndNonCanonicalBase64Url()
    {
        var payload = new byte[sizeof(long) + 1];
        BinaryPrimitives.WriteInt64BigEndian(payload, -1);
        payload[^1] = (byte)'a';
        var negativeVersion = ToBase64Url(payload);

        Assert.False(DriveDirectoryCursor.TryParse(negativeVersion, out _));
        Assert.False(DriveDirectoryCursor.TryParse("AQ==", out _));
        Assert.False(DriveDirectoryCursor.TryParse("not+a+cursor", out _));
    }

    [Fact]
    public async Task ListDirectoryMapsPageAndPassesStoredDriveKeyAndDecodedCursor()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync(
            DriveRelationType.Subscription,
            DriveStatus.Ready);
        var path = DirectoryPath("/电影");
        var cursor = DriveDirectoryCursor.Create(12, "第一部.mkv");
        fixture.HyperClient.ListDirectoryResult = new HyperDirectoryPage(
            path.Value,
            12,
            [
                new HyperDirectoryEntry(
                    "/电影/第二部.mkv",
                    "第二部.mkv",
                    "file",
                    8192),
                new HyperDirectoryEntry(
                    "/电影/花絮",
                    "花絮",
                    "directory",
                    null)
            ],
            "花絮");

        var result = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            path,
            cursor,
            25,
            CancellationToken.None);

        Assert.Equal(ResultStatus.Ok, result.Status);
        var directory = Assert.IsType<DriveDirectoryResponse>(result.Value);
        Assert.Equal(path.Value, directory.Path);
        Assert.Equal(12, directory.DriveVersion);
        Assert.Collection(
            directory.Entries,
            entry =>
            {
                Assert.Equal("/电影/第二部.mkv", entry.Path);
                Assert.Equal("第二部.mkv", entry.Name);
                Assert.Equal("file", entry.Type);
                Assert.Equal(8192, entry.Size);
            },
            entry =>
            {
                Assert.Equal("/电影/花絮", entry.Path);
                Assert.Equal("花絮", entry.Name);
                Assert.Equal("directory", entry.Type);
                Assert.Null(entry.Size);
            });
        Assert.True(DriveDirectoryCursor.TryParse(directory.NextCursor, out var nextCursor));
        Assert.Equal(12, nextCursor.DriveVersion);
        Assert.Equal("花絮", nextCursor.ChildName);

        var call = Assert.Single(fixture.HyperClient.ListDirectoryCalls);
        Assert.Equal(fixture.DriveKey, call.DriveKey);
        Assert.Equal(path, call.Path);
        Assert.Equal("第一部.mkv", call.Cursor);
        Assert.Equal(25, call.Limit);
    }

    [Fact]
    public async Task ListDirectoryRejectsCursorWhenDriveVersionChanged()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        var path = DirectoryPath("/");
        var cursor = DriveDirectoryCursor.Create(7, "before.mkv");
        fixture.HyperClient.ListDirectoryResult = new HyperDirectoryPage(
            path.Value,
            8,
            [],
            null);

        var result = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            path,
            cursor,
            100,
            CancellationToken.None);

        Assert.Equal(ResultStatus.Conflict, result.Status);
        Assert.Null(result.Value);
        Assert.Equal(
            "before.mkv",
            Assert.Single(fixture.HyperClient.ListDirectoryCalls).Cursor);
    }

    [Fact]
    public async Task SubscriptionCanListButCannotMutateContent()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync(
            DriveRelationType.Subscription,
            DriveStatus.Ready);
        var directoryPath = DirectoryPath("/");
        var filePath = FilePath("/movie.mkv");
        await using var content = new MemoryStream([1, 2, 3]);

        var listed = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            directoryPath,
            null,
            100,
            CancellationToken.None);
        var added = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            filePath,
            content,
            CancellationToken.None);
        var deletedFile = await fixture.Service.DeleteFileAsync(
            fixture.DriveId,
            filePath,
            CancellationToken.None);
        var deletedDirectory = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            directoryPath,
            CancellationToken.None);

        Assert.Equal(ResultStatus.Ok, listed.Status);
        Assert.Equal(ResultStatus.Forbidden, added.Status);
        Assert.Equal(ResultStatus.Forbidden, deletedFile.Status);
        Assert.Equal(ResultStatus.Forbidden, deletedDirectory.Status);
        Assert.Single(fixture.HyperClient.ListDirectoryCalls);
        Assert.Empty(fixture.HyperClient.AddFileCalls);
        Assert.Empty(fixture.HyperClient.DeleteFileCalls);
        Assert.Empty(fixture.HyperClient.DeleteDirectoryCalls);
    }

    [Theory]
    [InlineData("/", "/movie.mkv")]
    [InlineData("/.cinereel", "/.cinereel/drive.json")]
    public async Task NonReadyDriveRejectsAllContentOperationsBeforeCallingHyperClient(
        string directoryPathValue,
        string filePathValue)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync(
            DriveRelationType.Ownership,
            DriveStatus.Pending);
        var directoryPath = DirectoryPath(directoryPathValue);
        var filePath = FilePath(filePathValue);
        await using var content = new MemoryStream([1, 2, 3]);

        var listed = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            directoryPath,
            null,
            100,
            CancellationToken.None);
        var added = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            filePath,
            content,
            CancellationToken.None);
        var deletedFile = await fixture.Service.DeleteFileAsync(
            fixture.DriveId,
            filePath,
            CancellationToken.None);
        var deletedDirectory = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            directoryPath,
            CancellationToken.None);

        Assert.Equal(ResultStatus.Conflict, listed.Status);
        Assert.Equal(ResultStatus.Conflict, added.Status);
        Assert.Equal(ResultStatus.Conflict, deletedFile.Status);
        Assert.Equal(ResultStatus.Conflict, deletedDirectory.Status);
        AssertNoFileCalls(fixture.HyperClient);
    }

    [Fact]
    public async Task NonReadySubscriptionReportsLifecycleBeforeWritePermission()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync(
            DriveRelationType.Subscription,
            DriveStatus.Failed);
        var directoryPath = DirectoryPath("/");
        var filePath = FilePath("/movie.mkv");
        await using var content = new MemoryStream([1, 2, 3]);

        var added = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            filePath,
            content,
            CancellationToken.None);
        var deletedFile = await fixture.Service.DeleteFileAsync(
            fixture.DriveId,
            filePath,
            CancellationToken.None);
        var deletedDirectory = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            directoryPath,
            CancellationToken.None);

        Assert.Equal(ResultStatus.Conflict, added.Status);
        Assert.Equal(ResultStatus.Conflict, deletedFile.Status);
        Assert.Equal(ResultStatus.Conflict, deletedDirectory.Status);
        AssertNoFileCalls(fixture.HyperClient);
    }

    [Theory]
    [InlineData("/", "/movie.mkv")]
    [InlineData("/.cinereel", "/.cinereel/drive.json")]
    public async Task MissingDriveReturnsNotFoundForAllContentOperations(
        string directoryPathValue,
        string filePathValue)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        var missingDriveId = DriveId.New();
        var directoryPath = DirectoryPath(directoryPathValue);
        var filePath = FilePath(filePathValue);
        await using var content = new MemoryStream([1, 2, 3]);

        var listed = await fixture.Service.ListDirectoryAsync(
            missingDriveId,
            directoryPath,
            null,
            100,
            CancellationToken.None);
        var added = await fixture.Service.AddFileAsync(
            missingDriveId,
            filePath,
            content,
            CancellationToken.None);
        var deletedFile = await fixture.Service.DeleteFileAsync(
            missingDriveId,
            filePath,
            CancellationToken.None);
        var deletedDirectory = await fixture.Service.DeleteDirectoryAsync(
            missingDriveId,
            directoryPath,
            CancellationToken.None);

        Assert.Equal(ResultStatus.NotFound, listed.Status);
        Assert.Equal(ResultStatus.NotFound, added.Status);
        Assert.Equal(ResultStatus.NotFound, deletedFile.Status);
        Assert.Equal(ResultStatus.NotFound, deletedDirectory.Status);
        AssertNoFileCalls(fixture.HyperClient);
    }

    [Theory]
    [InlineData("/.cinereel")]
    [InlineData("/.cinereel/drive.json")]
    [InlineData("/.cinereel/nested/settings.json")]
    public async Task ReservedPathsRejectAllContentOperationsWithoutCallingHyperClient(
        string pathValue)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        await using var content = new MemoryStream([1, 2, 3]);

        var listed = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            DirectoryPath(pathValue),
            null,
            100,
            CancellationToken.None);
        var added = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            FilePath(pathValue),
            content,
            CancellationToken.None);
        var deletedFile = await fixture.Service.DeleteFileAsync(
            fixture.DriveId,
            FilePath(pathValue),
            CancellationToken.None);
        var deletedDirectory = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            DirectoryPath(pathValue),
            CancellationToken.None);

        Assert.Equal(ResultStatus.Forbidden, listed.Status);
        Assert.Null(listed.Value);
        Assert.Equal(ResultStatus.Forbidden, added.Status);
        Assert.Equal(ResultStatus.Forbidden, deletedFile.Status);
        Assert.Equal(ResultStatus.Forbidden, deletedDirectory.Status);
        Assert.Equal(0, content.Position);
        AssertNoFileCalls(fixture.HyperClient);
    }

    [Theory]
    [InlineData("/.cinereel-backup")]
    [InlineData("/.cinereel-backup/drive.json")]
    [InlineData("/video/.cinereel/drive.json")]
    public async Task SimilarOrdinaryPathsStillReachHyperClient(string pathValue)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        await using var content = new MemoryStream([1, 2, 3]);

        var listed = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            DirectoryPath(pathValue),
            null,
            100,
            CancellationToken.None);
        var added = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            FilePath(pathValue),
            content,
            CancellationToken.None);
        var deletedFile = await fixture.Service.DeleteFileAsync(
            fixture.DriveId,
            FilePath(pathValue),
            CancellationToken.None);
        var deletedDirectory = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            DirectoryPath(pathValue),
            CancellationToken.None);

        Assert.Equal(ResultStatus.Ok, listed.Status);
        Assert.Equal(ResultStatus.Created, added.Status);
        Assert.Equal(ResultStatus.NoContent, deletedFile.Status);
        Assert.Equal(ResultStatus.NoContent, deletedDirectory.Status);
        Assert.Single(fixture.HyperClient.ListDirectoryCalls);
        Assert.Single(fixture.HyperClient.AddFileCalls);
        Assert.Single(fixture.HyperClient.DeleteFileCalls);
        Assert.Single(fixture.HyperClient.DeleteDirectoryCalls);
    }

    [Fact]
    public async Task RootDirectoryCanStillBeListedAndDeleted()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();

        var listed = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            DirectoryPath("/"),
            null,
            100,
            CancellationToken.None);
        var deleted = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            DirectoryPath("/"),
            CancellationToken.None);

        Assert.Equal(ResultStatus.Ok, listed.Status);
        Assert.Equal(ResultStatus.NoContent, deleted.Status);
        Assert.Equal("/", Assert.Single(fixture.HyperClient.ListDirectoryCalls).Path.Value);
        Assert.Equal("/", Assert.Single(fixture.HyperClient.DeleteDirectoryCalls).Path.Value);
    }

    [Fact]
    public async Task ReadyDriveWithInvalidKeyViolatesPersistenceInvariant()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        var drive = await fixture.DbContext.Drives.SingleAsync();
        drive.Key = "invalid";
        await fixture.DbContext.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            fixture.Service.ListDirectoryAsync(
                fixture.DriveId,
                DirectoryPath("/"),
                null,
                100,
                CancellationToken.None));

        Assert.Contains("缺少有效的 DriveKey", exception.Message);
        AssertNoFileCalls(fixture.HyperClient);
    }

    [Theory]
    [InlineData(nameof(HyperAddFileResultCode.Created), ResultStatus.Created)]
    [InlineData(
        nameof(HyperAddFileResultCode.AlreadyExists),
        ResultStatus.Conflict)]
    [InlineData(
        nameof(HyperAddFileResultCode.DriveNotWritable),
        ResultStatus.Forbidden)]
    [InlineData(
        nameof(HyperAddFileResultCode.FileTooLarge),
        ResultStatus.Invalid)]
    public async Task AddFileMapsHyperResultAndStreamsContentUnchanged(
        string hyperResultName,
        ResultStatus expectedResult)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        fixture.HyperClient.AddFileResult = Enum.Parse<HyperAddFileResultCode>(
            hyperResultName);
        var path = FilePath("/video/movie.mkv");
        byte[] content = [0, 1, 2, 127, 128, 254, 255];
        await using var stream = new MemoryStream(content, writable: false);

        var result = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            path,
            stream,
            CancellationToken.None);

        Assert.Equal(expectedResult, result.Status);
        var call = Assert.Single(fixture.HyperClient.AddFileCalls);
        Assert.Equal(fixture.DriveKey, call.DriveKey);
        Assert.Equal(path, call.Path);
        Assert.Equal(content, call.Content);
    }

    [Fact]
    public async Task AddFileAcceptsUnknownLengthContentAtExactLimit()
    {
        const long maxFileSize = 3;
        await using var fixture = await DriveFileServiceFixture.CreateAsync(
            maxFileSize: maxFileSize);
        await using var content = new NonSeekableReadStream([1, 2, 3]);

        var result = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            FilePath("/exact-limit.mkv"),
            content,
            CancellationToken.None);

        Assert.Equal(ResultStatus.Created, result.Status);
        Assert.Equal([1, 2, 3], Assert.Single(fixture.HyperClient.AddFileCalls).Content);
        Assert.Equal(maxFileSize, content.BytesRead);
        Assert.True(content.CanRead);
    }

    [Theory]
    [InlineData(nameof(HyperReadFileResultCode.Success), ResultStatus.Ok)]
    [InlineData(nameof(HyperReadFileResultCode.NotFound), ResultStatus.NotFound)]
    [InlineData(nameof(HyperReadFileResultCode.InvalidTarget), ResultStatus.Conflict)]
    [InlineData(nameof(HyperReadFileResultCode.Unavailable), ResultStatus.CriticalError)]
    [InlineData(nameof(HyperReadFileResultCode.Timeout), ResultStatus.CriticalError)]
    public async Task DownloadFileMapsHyperResultAndPreservesMetadata(
        string hyperResultName,
        ResultStatus expectedResult)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        var path = FilePath("/video/电影.mkv");
        var content = new MemoryStream([1, 2, 3], writable: false);
        fixture.HyperClient.ReadFileResult =
            Enum.Parse<HyperReadFileResultCode>(hyperResultName) == HyperReadFileResultCode.Success
                ? new(
                    HyperReadFileResultCode.Success,
                    content,
                    "video/x-matroska",
                    3)
                : new(Enum.Parse<HyperReadFileResultCode>(hyperResultName));

        var result = await fixture.Service.DownloadFileAsync(
            fixture.DriveId,
            path,
            CancellationToken.None);

        Assert.Equal(expectedResult, result.Status);
        var call = Assert.Single(fixture.HyperClient.ReadFileCalls);
        Assert.Equal(fixture.DriveKey, call.DriveKey);
        Assert.Equal(path, call.Path);

        if (expectedResult == ResultStatus.Ok)
        {
            using var download = result.Value;
            Assert.Equal("电影.mkv", download.FileName);
            Assert.Equal("video/x-matroska", download.ContentType);
            Assert.Equal(3, download.ContentLength);
            Assert.Equal([1, 2, 3], await ReadAllAsync(download.Content));
        }
    }

    [Fact]
    public async Task AddFileRejectsUnknownLengthContentBeyondLimitWithoutClosingSource()
    {
        const long maxFileSize = 3;
        await using var fixture = await DriveFileServiceFixture.CreateAsync(
            maxFileSize: maxFileSize);
        await using var content = new NonSeekableReadStream([1, 2, 3, 4, 5]);

        var result = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            FilePath("/over-limit.mkv"),
            content,
            CancellationToken.None);

        Assert.Equal(ResultStatus.Invalid, result.Status);
        Assert.Equal(maxFileSize + 1, content.BytesRead);
        Assert.True(content.CanRead);
        Assert.Equal(5, content.ReadByte());
    }

    [Theory]
    [InlineData(
        nameof(HyperDeleteFileResultCode.Deleted),
        ResultStatus.NoContent)]
    [InlineData(
        nameof(HyperDeleteFileResultCode.NotFound),
        ResultStatus.NotFound)]
    [InlineData(
        nameof(HyperDeleteFileResultCode.DriveNotWritable),
        ResultStatus.Forbidden)]
    public async Task DeleteFileMapsHyperResult(
        string hyperResultName,
        ResultStatus expectedResult)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        fixture.HyperClient.DeleteFileResult = Enum.Parse<HyperDeleteFileResultCode>(
            hyperResultName);
        var path = FilePath("/video/movie.mkv");

        var result = await fixture.Service.DeleteFileAsync(
            fixture.DriveId,
            path,
            CancellationToken.None);

        Assert.Equal(expectedResult, result.Status);
        var call = Assert.Single(fixture.HyperClient.DeleteFileCalls);
        Assert.Equal(fixture.DriveKey, call.DriveKey);
        Assert.Equal(path, call.Path);
    }

    [Theory]
    [InlineData(
        nameof(HyperDeleteDirectoryResultCode.Deleted),
        ResultStatus.NoContent)]
    [InlineData(
        nameof(HyperDeleteDirectoryResultCode.DriveNotWritable),
        ResultStatus.Forbidden)]
    public async Task DeleteDirectoryMapsHyperResult(
        string hyperResultName,
        ResultStatus expectedResult)
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        fixture.HyperClient.DeleteDirectoryResult =
            Enum.Parse<HyperDeleteDirectoryResultCode>(hyperResultName);
        var path = DirectoryPath("/video");

        var result = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            path,
            CancellationToken.None);

        Assert.Equal(expectedResult, result.Status);
        var call = Assert.Single(fixture.HyperClient.DeleteDirectoryCalls);
        Assert.Equal(fixture.DriveKey, call.DriveKey);
        Assert.Equal(path, call.Path);
    }

    [Fact]
    public async Task HyperFailuresMapToContentUnavailable()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        var directoryPath = DirectoryPath("/");
        var filePath = FilePath("/movie.mkv");
        fixture.HyperClient.ListDirectoryException = new HttpRequestException("不可用");
        fixture.HyperClient.AddFileException = new IOException("不可用");
        fixture.HyperClient.DeleteFileException = new HyperClientException("不可用");
        fixture.HyperClient.DeleteDirectoryException = new TimeoutException("不可用");
        await using var content = new MemoryStream([1, 2, 3]);

        var listed = await fixture.Service.ListDirectoryAsync(
            fixture.DriveId,
            directoryPath,
            null,
            100,
            CancellationToken.None);
        var added = await fixture.Service.AddFileAsync(
            fixture.DriveId,
            filePath,
            content,
            CancellationToken.None);
        var deletedFile = await fixture.Service.DeleteFileAsync(
            fixture.DriveId,
            filePath,
            CancellationToken.None);
        var deletedDirectory = await fixture.Service.DeleteDirectoryAsync(
            fixture.DriveId,
            directoryPath,
            CancellationToken.None);

        Assert.Equal(ResultStatus.CriticalError, listed.Status);
        Assert.Null(listed.Value);
        Assert.Equal(ResultStatus.CriticalError, added.Status);
        Assert.Equal(ResultStatus.CriticalError, deletedFile.Status);
        Assert.Equal(ResultStatus.CriticalError, deletedDirectory.Status);
    }

    [Fact]
    public async Task CallerCancellationPropagatesThroughWrappedHyperFailures()
    {
        await using var fixture = await DriveFileServiceFixture.CreateAsync();
        var directoryPath = DirectoryPath("/");
        var filePath = FilePath("/movie.mkv");
        await using var content = new MemoryStream([1, 2, 3]);

        await AssertWrappedCallerCancellationAsync(
            fixture.HyperClient,
            exception => fixture.HyperClient.ListDirectoryException = exception,
            cancellationToken => fixture.Service.ListDirectoryAsync(
                fixture.DriveId,
                directoryPath,
                null,
                100,
                cancellationToken));
        await AssertWrappedCallerCancellationAsync(
            fixture.HyperClient,
            exception => fixture.HyperClient.AddFileException = exception,
            cancellationToken => fixture.Service.AddFileAsync(
                fixture.DriveId,
                filePath,
                content,
                cancellationToken));
        await AssertWrappedCallerCancellationAsync(
            fixture.HyperClient,
            exception => fixture.HyperClient.DeleteFileException = exception,
            cancellationToken => fixture.Service.DeleteFileAsync(
                fixture.DriveId,
                filePath,
                cancellationToken));
        await AssertWrappedCallerCancellationAsync(
            fixture.HyperClient,
            exception => fixture.HyperClient.DeleteDirectoryException = exception,
            cancellationToken => fixture.Service.DeleteDirectoryAsync(
                fixture.DriveId,
                directoryPath,
                cancellationToken));
    }

    private static DriveFilePath FilePath(string value)
    {
        Assert.True(DriveFilePath.TryCreate(value, out var path));
        return path;
    }

    private static DriveDirectoryPath DirectoryPath(string value)
    {
        Assert.True(DriveDirectoryPath.TryCreate(value, out var path));
        return path;
    }

    private static string ToBase64Url(byte[] payload) =>
        Convert.ToBase64String(payload)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static HttpRequestException WrappedCancellation(
        CancellationToken cancellationToken) =>
        new(
            "Hyper 请求因调用方取消而失败。",
            new OperationCanceledException(cancellationToken));

    private static async Task AssertWrappedCallerCancellationAsync(
        TestHyperClient hyperClient,
        Action<Exception?> configureException,
        Func<CancellationToken, Task> operation)
    {
        using var cancellationSource = new CancellationTokenSource();
        hyperClient.BeforeFileOperation = cancellationSource.Cancel;
        configureException(WrappedCancellation(cancellationSource.Token));

        try
        {
            Assert.False(cancellationSource.IsCancellationRequested);
            var exception = await Assert.ThrowsAnyAsync<OperationCanceledException>(
                () => operation(cancellationSource.Token));
            Assert.True(cancellationSource.IsCancellationRequested);
            Assert.Equal(cancellationSource.Token, exception.CancellationToken);
        }
        finally
        {
            hyperClient.BeforeFileOperation = null;
            configureException(null);
        }
    }

    private static void AssertNoFileCalls(TestHyperClient hyperClient)
    {
        Assert.Empty(hyperClient.ListDirectoryCalls);
        Assert.Empty(hyperClient.AddFileCalls);
        Assert.Empty(hyperClient.ReadFileCalls);
        Assert.Empty(hyperClient.DeleteFileCalls);
        Assert.Empty(hyperClient.DeleteDirectoryCalls);
    }

    private static async Task<byte[]> ReadAllAsync(Stream content)
    {
        await using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer);
        return buffer.ToArray();
    }

    private sealed class DriveFileServiceFixture : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;

        private DriveFileServiceFixture(
            SqliteConnection connection,
            CinereelDbContext dbContext,
            TestHyperClient hyperClient,
            DriveFileService service,
            DriveId driveId,
            DriveKey driveKey)
        {
            _connection = connection;
            DbContext = dbContext;
            HyperClient = hyperClient;
            Service = service;
            DriveId = driveId;
            DriveKey = driveKey;
        }

        internal CinereelDbContext DbContext { get; }

        internal TestHyperClient HyperClient { get; }

        internal DriveFileService Service { get; }

        internal DriveId DriveId { get; }

        internal DriveKey DriveKey { get; }

        internal static async Task<DriveFileServiceFixture> CreateAsync(
            DriveRelationType relationType = DriveRelationType.Ownership,
            DriveStatus status = DriveStatus.Ready,
            long maxFileSize = IDriveFileService.MaxFileSize)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var options = new DbContextOptionsBuilder<CinereelDbContext>()
                .UseSqlite(connection)
                .Options;
            var dbContext = new CinereelDbContext(options);
            await dbContext.Database.MigrateAsync();
            var hyperClient = new TestHyperClient();
            var service = new DriveFileService(
                new DriveRepository(dbContext),
                hyperClient,
                NullLogger<DriveFileService>.Instance,
                maxFileSize);
            var driveId = DriveId.New();
            Assert.True(DriveKey.TryCreate(new string('d', 64), out var driveKey));
            var now = DateTimeOffset.UtcNow;
            dbContext.Drives.Add(new DriveEntity
            {
                Id = driveId.Value,
                Key = status == DriveStatus.Ready ? driveKey.Value : null,
                Name = "测试 Drive",
                ContentTypeId = DriveContentTypeId.GenericValue,
                Status = status,
                RelationType = relationType,
                CreatedAt = now,
                UpdatedAt = now
            });
            await dbContext.SaveChangesAsync();

            return new DriveFileServiceFixture(
                connection,
                dbContext,
                hyperClient,
                service,
                driveId,
                driveKey);
        }

        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }

    private sealed class NonSeekableReadStream(byte[] content) : Stream
    {
        private readonly MemoryStream inner = new(content, writable: false);
        private bool disposed;

        internal long BytesRead { get; private set; }

        public override bool CanRead => !disposed;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            var bytesRead = inner.Read(buffer, offset, count);
            BytesRead += bytesRead;
            return bytesRead;
        }

        public override int Read(Span<byte> buffer)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            var bytesRead = inner.Read(buffer);
            BytesRead += bytesRead;
            return bytesRead;
        }

        public override int ReadByte()
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            var value = inner.ReadByte();

            if (value >= 0)
            {
                BytesRead++;
            }

            return value;
        }

        public override async ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            var bytesRead = await inner.ReadAsync(buffer, cancellationToken);
            BytesRead += bytesRead;
            return bytesRead;
        }

        public override long Seek(long offset, SeekOrigin origin) =>
            throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) =>
            throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing && !disposed)
            {
                inner.Dispose();
                disposed = true;
            }

            base.Dispose(disposing);
        }

        public override async ValueTask DisposeAsync()
        {
            if (!disposed)
            {
                await inner.DisposeAsync();
                disposed = true;
            }

            GC.SuppressFinalize(this);
        }
    }
}
