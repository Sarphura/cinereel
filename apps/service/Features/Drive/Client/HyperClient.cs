using System.Net.Http.Json;

namespace Cinereel.Features.Drive;

internal sealed class HyperClient(HttpClient httpClient) : IHyperClient
{
    public async Task<DriveKey> EnsureDriveAsync(
        DriveId driveId,
        DriveName name,
        CancellationToken cancellationToken)
    {
        using var response = await httpClient.PostAsJsonAsync(
            "v1/drives",
            new CreateHyperDriveRequest(
                driveId.ToString(),
                name.Value,
                "blob"),
            cancellationToken);

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<CreateHyperDriveResponse>(
            cancellationToken);

        if (body is null || !DriveKey.TryCreate(body.DriveKey, out var driveKey))
        {
            throw new HyperClientException(
                "Hyper Client 创建响应缺少有效的 driveKey。");
        }

        return driveKey;
    }

    public async Task DeleteAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken)
    {
        using var response = await httpClient.DeleteAsync(
            $"v1/drives/{driveKey.Value}",
            cancellationToken);

        response.EnsureSuccessStatusCode();
    }

    private sealed record CreateHyperDriveRequest(
        string Namespace,
        string Name,
        string Type);

    private sealed record CreateHyperDriveResponse(string DriveKey);
}
