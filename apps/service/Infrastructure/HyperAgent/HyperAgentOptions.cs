using Microsoft.Extensions.Configuration;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Configuration options for <see cref="HyperAgentVersionProbe"/>.
/// Resolved from the <c>HyperAgent:</c> configuration section and the
/// documented environment variables; the App Server's startup code
/// constructs a probe from these options and runs it as a side-effecting
/// step in its pre-bind hook.
/// </summary>
public sealed class HyperAgentOptions
{
    /// <summary>
    /// The Hyper Agent's <c>version</c> string (semver) the App Server
    /// expects to see in the response body of <c>GET /v1/version</c>.
    /// A mismatch is a fatal startup error (exit code 76).
    /// </summary>
    public string ExpectedVersion { get; set; } = "0.0.0";

    /// <summary>
    /// Loopback base URL of the Hyper Agent (e.g. <c>http://127.0.0.1:4201</c>).
    /// </summary>
    public string BaseUrl { get; set; } = "http://127.0.0.1:4201";

    /// <summary>
    /// The shared-secret token the App Server sends on every request.
    /// Resolves from <c>HYPER_AGENT_SHARED_TOKEN</c> /
    /// <c>SIDECAR_TOKEN</c> / <c>&lt;CINEREEL_DATA_DIR&gt;/sidecar.token</c>.
    /// </summary>
    public string SharedToken { get; set; } = string.Empty;

    public static HyperAgentOptions Bind(IConfiguration config)
    {
        var opts = new HyperAgentOptions();
        var section = config.GetSection("HyperAgent");
        section.Bind(opts);

        if (string.IsNullOrWhiteSpace(opts.ExpectedVersion))
        {
            opts.ExpectedVersion = config["HYPER_AGENT_EXPECTED_VERSION"] ?? "0.0.0";
        }
        if (string.IsNullOrWhiteSpace(opts.BaseUrl))
        {
            var port = config["SIDECAR_PORT"] ?? "4201";
            opts.BaseUrl = $"http://127.0.0.1:{port}";
        }
        if (string.IsNullOrWhiteSpace(opts.SharedToken))
        {
            opts.SharedToken = config["HYPER_AGENT_SHARED_TOKEN"]
                ?? config["SIDECAR_TOKEN"]
                ?? string.Empty;
        }
        return opts;
    }
}

/// <summary>
/// Logical name for the Hyper Agent's typed <see cref="HttpClient"/>.
/// Used by callers that register a <see cref="System.Net.Http.HttpClientFactory"/>
/// to inject the shared-secret header and base URL.
/// </summary>
public static class HyperAgentHttpClient
{
    public const string Name = "hyper-agent";
}
