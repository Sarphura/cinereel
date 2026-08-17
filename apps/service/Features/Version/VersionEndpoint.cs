using System.Diagnostics;
using System.Reflection;

namespace CineReel.Service.Features.Version;

/// <summary>
/// Stable build / runtime identity for the Application Server.
/// The Sidecar reads X-Cinereel-Version from a `/version`
/// endpoint on this server and refuses to talk to it if the versions diverge
/// beyond the supported set. The endpoint is plain JSON, no auth.
/// </summary>
public sealed record VersionResponse(
    string Service,
    string Version,
    string ApiVersion,
    string Runtime,
    DateTimeOffset BuiltAt,
    string Commit);

public static class VersionEndpoint
{
    public static IEndpointRouteBuilder MapVersion(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/version", () =>
        {
            var assembly = typeof(VersionEndpoint).Assembly;
            var version = assembly.GetName().Version?.ToString() ?? "0.0.0";
            var buildInfo = BuildInfoReader.Read();
            return Results.Ok(new VersionResponse(
                Service: "cinereel-app-server",
                Version: version,
                ApiVersion: "v1",
                Runtime: $"{Environment.Version}",
                BuiltAt: buildInfo.BuiltAt,
                Commit: buildInfo.Commit));
        })
        .WithName("GetVersion")
        .WithTags("Meta")
        .Produces<VersionResponse>(StatusCodes.Status200OK);

        return app;
    }
}

/// <summary>
/// Reads build-time metadata embedded by the build pipeline.
/// For the minimal skeleton, falls back to "unknown" / process start time.
/// </summary>
internal static class BuildInfoReader
{
    public readonly record struct Info(DateTimeOffset BuiltAt, string Commit);

    public static Info Read()
    {
        var assembly = typeof(BuildInfoReader).Assembly;
        var buildAttr = assembly.GetCustomAttributes<BuildMetadataAttribute>().FirstOrDefault();

        return buildAttr is null
            ? new Info(Process.GetCurrentProcess().StartTime, "unknown")
            : new Info(buildAttr.BuiltAt, buildAttr.Commit);
    }
}

/// <summary>
/// Attached to the assembly at build time. Source generators can fill this in
/// from `$(BUILD_TIMESTAMP)` and `$(GIT_COMMIT)` MSBuild properties.
/// V1 ships an empty attribute; production builds should emit real values.
/// </summary>
[AttributeUsage(AttributeTargets.Assembly, AllowMultiple = false)]
internal sealed class BuildMetadataAttribute(DateTimeOffset builtAt, string commit) : Attribute
{
    public DateTimeOffset BuiltAt { get; } = builtAt;
    public string Commit { get; } = commit;
}
