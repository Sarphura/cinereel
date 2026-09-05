using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Cinereel.Features.Drive;
using Cinereel.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveFileEndpointTests : IClassFixture<CinereelWebApplicationFactory>
{
    private readonly CinereelWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public DriveFileEndpointTests(CinereelWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task FourFileEndpointsCompleteNormalWorkflow()
    {
        ResetHyperClient();
        var drive = await SeedDriveAsync(
            DriveRelationType.Ownership,
            DriveStatus.Ready);
        _factory.HyperClient.ListDirectoryResult = new HyperDirectoryPage(
            "/video",
            9,
            [
                new HyperDirectoryEntry(
                    "/video/movie.mkv",
                    "movie.mkv",
                    "file",
                    4096)
            ],
            "movie.mkv");

        var listResponse = await _client.GetAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path=%2Fvideo&limit=20");

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var directory = await listResponse.Content
            .ReadFromJsonAsync<DriveDirectoryResponse>();
        Assert.NotNull(directory);
        Assert.Equal("/video", directory.Path);
        Assert.Equal(9, directory.DriveVersion);
        var entry = Assert.Single(directory.Entries);
        Assert.Equal("/video/movie.mkv", entry.Path);
        Assert.Equal("movie.mkv", entry.Name);
        Assert.Equal("file", entry.Type);
        Assert.Equal(4096, entry.Size);
        Assert.True(DriveDirectoryCursor.TryParse(directory.NextCursor, out var nextCursor));
        Assert.Equal(9, nextCursor.DriveVersion);
        Assert.Equal("movie.mkv", nextCursor.ChildName);
        var listCall = Assert.Single(_factory.HyperClient.ListDirectoryCalls);
        Assert.Equal(drive.DriveKey, listCall.DriveKey);
        Assert.Equal("/video", listCall.Path.Value);
        Assert.Null(listCall.Cursor);
        Assert.Equal(20, listCall.Limit);

        var bytes = Enumerable.Range(0, 256).Select(value => (byte)value).ToArray();
        using var addRequest = CreateBinaryRequest(
            HttpMethod.Put,
            drive.DriveId,
            "/video/new.mkv",
            bytes);
        var addResponse = await _client.SendAsync(addRequest);

        Assert.Equal(HttpStatusCode.Created, addResponse.StatusCode);
        var addCall = Assert.Single(_factory.HyperClient.AddFileCalls);
        Assert.Equal(drive.DriveKey, addCall.DriveKey);
        Assert.Equal("/video/new.mkv", addCall.Path.Value);
        Assert.Equal(bytes, addCall.Content);

        var deleteFileResponse = await _client.DeleteAsync(
            $"/api/drives/{drive.DriveId}/files?path=%2Fvideo%2Fnew.mkv");
        Assert.Equal(HttpStatusCode.NoContent, deleteFileResponse.StatusCode);
        var deleteFileCall = Assert.Single(_factory.HyperClient.DeleteFileCalls);
        Assert.Equal(drive.DriveKey, deleteFileCall.DriveKey);
        Assert.Equal("/video/new.mkv", deleteFileCall.Path.Value);

        var deleteDirectoryResponse = await _client.DeleteAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path=%2Fvideo");
        Assert.Equal(HttpStatusCode.NoContent, deleteDirectoryResponse.StatusCode);
        var deleteDirectoryCall = Assert.Single(
            _factory.HyperClient.DeleteDirectoryCalls);
        Assert.Equal(drive.DriveKey, deleteDirectoryCall.DriveKey);
        Assert.Equal("/video", deleteDirectoryCall.Path.Value);
    }

    [Theory]
    [InlineData("/.cinereel")]
    [InlineData("/.cinereel/drive.json")]
    public async Task ReservedPathsReturnIdentifiableForbiddenProblemWithoutCallingHyperClient(
        string path)
    {
        ResetHyperClient();
        var drive = await SeedDriveAsync(
            DriveRelationType.Ownership,
            DriveStatus.Ready);
        var query = Uri.EscapeDataString(path);

        using var listResponse = await _client.GetAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path={query}");
        using var addRequest = CreateBinaryRequest(
            HttpMethod.Put,
            drive.DriveId,
            path,
            [1, 2, 3]);
        using var addResponse = await _client.SendAsync(addRequest);
        using var deleteFileResponse = await _client.DeleteAsync(
            $"/api/drives/{drive.DriveId}/files?path={query}");
        using var deleteDirectoryResponse = await _client.DeleteAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path={query}");

        foreach (var response in new[]
        {
            listResponse, addResponse, deleteFileResponse, deleteDirectoryResponse
        })
        {
            var problem = await AssertProblemAsync(response, HttpStatusCode.Forbidden);
            Assert.Equal("reserved_path", problem.GetProperty("code").GetString());
        }

        AssertNoFileCalls();
    }

    [Fact]
    public async Task EmptyCursorUsesFirstPageAndDefaultLimit()
    {
        ResetHyperClient();
        var drive = await SeedDriveAsync(
            DriveRelationType.Subscription,
            DriveStatus.Ready);

        var response = await _client.GetAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path=%2F&cursor=");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var call = Assert.Single(_factory.HyperClient.ListDirectoryCalls);
        Assert.Null(call.Cursor);
        Assert.Equal(IDriveFileService.DefaultDirectoryPageSize, call.Limit);
    }

    [Theory]
    [InlineData("GET", "/api/drives/not-a-guid/files/entries?path=%2F")]
    [InlineData("GET", "/api/drives/{driveId}/files/entries")]
    [InlineData("GET", "/api/drives/{driveId}/files/entries?path=relative")]
    [InlineData("GET", "/api/drives/{driveId}/files/entries?path=%2F&cursor=invalid")]
    [InlineData("GET", "/api/drives/{driveId}/files/entries?path=%2F&limit=0")]
    [InlineData("GET", "/api/drives/{driveId}/files/entries?path=%2F&limit=501")]
    [InlineData("PUT", "/api/drives/{driveId}/files?path=%2F")]
    [InlineData("DELETE", "/api/drives/{driveId}/files?path=relative")]
    [InlineData("DELETE", "/api/drives/{driveId}/files/entries?path=relative")]
    public async Task InvalidParametersReturnBadRequestWithoutCallingHyperClient(
        string method,
        string routeTemplate)
    {
        ResetHyperClient();
        var route = routeTemplate.Replace(
            "{driveId}",
            Guid.NewGuid().ToString("D"),
            StringComparison.Ordinal);
        using var request = new HttpRequestMessage(new HttpMethod(method), route);

        if (request.Method == HttpMethod.Put)
        {
            request.Content = CreateBinaryContent([]);
        }

        var response = await _client.SendAsync(request);

        await AssertProblemAsync(response, HttpStatusCode.BadRequest);
        AssertNoFileCalls();
    }

    [Fact]
    public async Task AddFileRequiresOctetStreamContent()
    {
        ResetHyperClient();
        var drive = await SeedDriveAsync(
            DriveRelationType.Ownership,
            DriveStatus.Ready);
        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            $"/api/drives/{drive.DriveId}/files?path=%2Fmovie.mkv")
        {
            Content = new StringContent("不是二进制媒体类型")
        };

        var response = await _client.SendAsync(request);

        await AssertProblemAsync(response, HttpStatusCode.UnsupportedMediaType);
        AssertNoFileCalls();
    }

    [Fact]
    public async Task DriveVisibilityReadinessAndRelationshipMapToHttpStatus()
    {
        ResetHyperClient();
        var pendingDrive = await SeedDriveAsync(
            DriveRelationType.Ownership,
            DriveStatus.Pending);
        var subscription = await SeedDriveAsync(
            DriveRelationType.Subscription,
            DriveStatus.Ready);
        var missingDriveId = Guid.NewGuid();

        var missingResponse = await _client.GetAsync(
            $"/api/drives/{missingDriveId:D}/files/entries?path=%2F");
        await AssertProblemAsync(missingResponse, HttpStatusCode.NotFound);

        var pendingResponse = await _client.GetAsync(
            $"/api/drives/{pendingDrive.DriveId}/files/entries?path=%2F");
        await AssertProblemAsync(pendingResponse, HttpStatusCode.Conflict);

        using var subscriptionRequest = CreateBinaryRequest(
            HttpMethod.Put,
            subscription.DriveId,
            "/movie.mkv",
            [1, 2, 3]);
        var subscriptionResponse = await _client.SendAsync(subscriptionRequest);
        await AssertProblemAsync(subscriptionResponse, HttpStatusCode.Forbidden);

        AssertNoFileCalls();
    }

    [Fact]
    public async Task HyperBusinessResultsAndFailuresMapToHttpStatus()
    {
        ResetHyperClient();
        var drive = await SeedDriveAsync(
            DriveRelationType.Ownership,
            DriveStatus.Ready);

        _factory.HyperClient.AddFileResult = HyperAddFileResultCode.AlreadyExists;
        using (var request = CreateBinaryRequest(
            HttpMethod.Put,
            drive.DriveId,
            "/exists.mkv",
            [1]))
        {
            var response = await _client.SendAsync(request);
            await AssertProblemAsync(response, HttpStatusCode.Conflict);
        }

        _factory.HyperClient.AddFileResult = HyperAddFileResultCode.FileTooLarge;
        using (var request = CreateBinaryRequest(
            HttpMethod.Put,
            drive.DriveId,
            "/large.mkv",
            [1]))
        {
            var response = await _client.SendAsync(request);
            await AssertProblemAsync(response, HttpStatusCode.RequestEntityTooLarge);
        }

        _factory.HyperClient.AddFileException = new HttpRequestException("不可用");
        using (var request = CreateBinaryRequest(
            HttpMethod.Put,
            drive.DriveId,
            "/unavailable.mkv",
            [1]))
        {
            var response = await _client.SendAsync(request);
            await AssertProblemAsync(response, HttpStatusCode.ServiceUnavailable);
        }
        _factory.HyperClient.AddFileException = null;

        _factory.HyperClient.DeleteFileResult = HyperDeleteFileResultCode.NotFound;
        var missingFileResponse = await _client.DeleteAsync(
            $"/api/drives/{drive.DriveId}/files?path=%2Fmissing.mkv");
        await AssertProblemAsync(missingFileResponse, HttpStatusCode.NotFound);

        var cursor = DriveDirectoryCursor.Create(3, "before.mkv");
        _factory.HyperClient.ListDirectoryResult = new HyperDirectoryPage(
            "/",
            4,
            [],
            null);
        var versionConflictResponse = await _client.GetAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path=%2F&cursor=" +
            Uri.EscapeDataString(cursor.Value));
        await AssertProblemAsync(versionConflictResponse, HttpStatusCode.Conflict);

        _factory.HyperClient.ListDirectoryException = new IOException("不可用");
        var unavailableListResponse = await _client.GetAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path=%2F");
        await AssertProblemAsync(
            unavailableListResponse,
            HttpStatusCode.ServiceUnavailable);
        _factory.HyperClient.ListDirectoryException = null;

        _factory.HyperClient.DeleteDirectoryException = new TimeoutException("不可用");
        var unavailableDeleteResponse = await _client.DeleteAsync(
            $"/api/drives/{drive.DriveId}/files/entries?path=%2Fvideo");
        await AssertProblemAsync(
            unavailableDeleteResponse,
            HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public void AddFileDisablesTransportRequestSizeLimit()
    {
        var endpointDataSource = _factory.Services.GetRequiredService<EndpointDataSource>();
        var endpoint = endpointDataSource.Endpoints.Single(candidate =>
        {
            var action = candidate.Metadata.GetMetadata<ControllerActionDescriptor>();
            return action?.ControllerTypeInfo.AsType() == typeof(DriveFileController) &&
                string.Equals(
                    action.MethodInfo.Name,
                    nameof(DriveFileController.AddFile),
                    StringComparison.Ordinal);
        });
        var requestSizeLimit = endpoint.Metadata.GetMetadata<IRequestSizeLimitMetadata>();

        Assert.NotNull(requestSizeLimit);
        Assert.Null(requestSizeLimit.MaxRequestBodySize);
    }

    [Theory]
    [InlineData("/swagger/v1/swagger.json")]
    [InlineData("/openapi/v1.json")]
    public async Task OpenApiDescribesFourFileOperationsAndBinaryUpload(
        string documentPath)
    {
        var response = await _client.GetAsync(documentPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var document = await JsonDocument.ParseAsync(stream);
        var paths = document.RootElement.GetProperty("paths");
        var filePath = paths.GetProperty("/api/drives/{driveId}/files");
        var directoryPath = paths.GetProperty("/api/drives/{driveId}/files/entries");

        var put = filePath.GetProperty("put");
        var deleteFile = filePath.GetProperty("delete");
        Assert.True(directoryPath.TryGetProperty("get", out var get));
        var deleteDirectory = directoryPath.GetProperty("delete");
        var requestBody = put.GetProperty("requestBody");
        Assert.True(requestBody.GetProperty("required").GetBoolean());
        var uploadSchema = requestBody
            .GetProperty("content")
            .GetProperty("application/octet-stream")
            .GetProperty("schema");
        Assert.Equal("string", uploadSchema.GetProperty("type").GetString());
        Assert.Equal("binary", uploadSchema.GetProperty("format").GetString());
        AssertRequiredQueryParameter(get, "path");
        AssertRequiredQueryParameter(put, "path");
        AssertRequiredQueryParameter(deleteFile, "path");
        AssertRequiredQueryParameter(deleteDirectory, "path");
        AssertProblemContent(get, "400", "403", "404", "409", "503");
        AssertProblemContent(put, "400", "403", "404", "409", "413", "415", "503");
        AssertProblemContent(deleteFile, "400", "403", "404", "409", "503");
        AssertProblemContent(deleteDirectory, "400", "403", "404", "409", "503");
        foreach (var operation in new[] { get, put, deleteFile, deleteDirectory })
        {
            Assert.Contains(
                "reserved_path",
                operation.GetProperty("responses")
                    .GetProperty("403")
                    .GetProperty("description")
                    .GetString());
        }

        AssertResponseCodes(
            get,
            "200",
            "400",
            "403",
            "404",
            "409",
            "503");
        AssertResponseCodes(
            put,
            "201",
            "400",
            "403",
            "404",
            "409",
            "413",
            "415",
            "503");
    }

    private void ResetHyperClient()
    {
        _factory.HyperClient.ResetFileOperations();
    }

    private void AssertNoFileCalls()
    {
        Assert.Empty(_factory.HyperClient.ListDirectoryCalls);
        Assert.Empty(_factory.HyperClient.AddFileCalls);
        Assert.Empty(_factory.HyperClient.DeleteFileCalls);
        Assert.Empty(_factory.HyperClient.DeleteDirectoryCalls);
    }

    private async Task<SeededDrive> SeedDriveAsync(
        DriveRelationType relationType,
        DriveStatus status)
    {
        var driveId = DriveId.New();
        var keyValue = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        Assert.True(DriveKey.TryCreate(keyValue, out var driveKey));
        var now = DateTimeOffset.UtcNow;

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<CinereelDbContext>();
        dbContext.Drives.Add(new DriveEntity
        {
            Id = driveId.Value,
            Key = status == DriveStatus.Ready ? driveKey.Value : null,
            Name = "端点测试 Drive",
            ContentTypeId = DriveContentTypeId.GenericValue,
            Status = status,
            RelationType = relationType,
            CreatedAt = now,
            UpdatedAt = now
        });
        await dbContext.SaveChangesAsync();
        return new SeededDrive(driveId, driveKey);
    }

    private static HttpRequestMessage CreateBinaryRequest(
        HttpMethod method,
        DriveId driveId,
        string path,
        byte[] body)
    {
        return new HttpRequestMessage(
            method,
            $"/api/drives/{driveId}/files?path={Uri.EscapeDataString(path)}")
        {
            Content = CreateBinaryContent(body)
        };
    }

    private static ByteArrayContent CreateBinaryContent(byte[] body)
    {
        var content = new ByteArrayContent(body);
        content.Headers.ContentType = new MediaTypeHeaderValue(
            "application/octet-stream");
        return content;
    }

    private static async Task<JsonElement> AssertProblemAsync(
        HttpResponseMessage response,
        HttpStatusCode expectedStatus)
    {
        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Equal(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal((int)expectedStatus, problem.GetProperty("status").GetInt32());
        return problem;
    }

    private static void AssertResponseCodes(
        JsonElement operation,
        params string[] expectedCodes)
    {
        var responses = operation.GetProperty("responses");

        foreach (var code in expectedCodes)
        {
            Assert.True(
                responses.TryGetProperty(code, out _),
                $"OpenAPI 操作缺少 {code} 响应。\n{operation}");
        }
    }

    private static void AssertRequiredQueryParameter(
        JsonElement operation,
        string parameterName)
    {
        var parameter = operation
            .GetProperty("parameters")
            .EnumerateArray()
            .Single(candidate =>
                candidate.GetProperty("name").GetString() == parameterName &&
                candidate.GetProperty("in").GetString() == "query");
        Assert.True(parameter.GetProperty("required").GetBoolean());
    }

    private static void AssertProblemContent(
        JsonElement operation,
        params string[] responseCodes)
    {
        var responses = operation.GetProperty("responses");

        foreach (var code in responseCodes)
        {
            var content = responses
                .GetProperty(code)
                .GetProperty("content");
            Assert.True(content.TryGetProperty("application/problem+json", out _));
        }
    }

    private sealed record SeededDrive(DriveId DriveId, DriveKey DriveKey);
}
