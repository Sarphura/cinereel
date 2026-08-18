namespace Cinereel.Features.SystemInfo;

internal static class GetSystemInfoEndpoint
{
    internal static RouteHandlerBuilder MapGetSystemInfo(this RouteGroupBuilder group)
    {
        return group
            .MapGet("", (SystemInfoReader reader) =>
                TypedResults.Ok(SystemInfoResponse.From(reader.Read())))
            .WithName("GetSystemInfo")
            .WithSummary("获取当前 Cinereel 实例的运行信息")
            .Produces<SystemInfoResponse>(StatusCodes.Status200OK);
    }
}

internal sealed record SystemInfoResponse(
    string Product,
    string Version,
    string Runtime)
{
    internal static SystemInfoResponse From(SystemInfoSnapshot snapshot) =>
        new(snapshot.Product, snapshot.Version, snapshot.Runtime);
}
