using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Response payload of the Hyper Agent's <c>GET /v1/version</c> endpoint.
/// The shape is fixed by the Hyper Agent's Nest controller
/// (see <c>apps/hyper-agent/src/feature/version/controller.ts</c>).
/// </summary>
public sealed record HyperAgentVersionResponse(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("version")] string Version);

/// <summary>
/// Probes the Hyper Agent's <c>GET /v1/version</c> endpoint and compares
/// it to the Application Server's expected version. This is wired into
/// the App Server's startup sequence: after <c>/healthz</c> returns
/// 200 the App Server issues a version probe and refuses to proceed if
/// the strings differ. A mismatch is a fatal startup error with both
/// versions in the log line and the documented exit code <c>76</c>.
///
/// The probe is a small, side-effect-free object so tests can drive it
/// against a fake <see cref="HttpMessageHandler"/> without spinning up
/// the real Hyper Agent process (the integration smoke covers the
/// full two-process boot).
/// </summary>
public sealed class HyperAgentVersionProbe
{
    /// <summary>
    /// Exit code the App Server process emits when the Hyper Agent's
    /// version differs from the App Server's expected version. Lives
    /// here so the App Server stays self-contained — it does not need
    /// to import any TS-side constants.
    /// </summary>
    public const int ExitCodeVersionMismatch = 76;

    private readonly HttpClient _http;
    private readonly string _expectedVersion;
    private readonly ILogger<HyperAgentVersionProbe> _logger;

    public HyperAgentVersionProbe(
        HttpClient http,
        string expectedVersion,
        ILogger<HyperAgentVersionProbe> logger)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _expectedVersion = expectedVersion
            ?? throw new ArgumentNullException(nameof(expectedVersion));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Fetch <c>/v1/version</c> from the Hyper Agent and verify the
    /// returned <c>version</c> string matches <c>expectedVersion</c>.
    /// Throws <see cref="HyperAgentVersionMismatchException"/> on a
    /// mismatch; transport errors propagate as <see cref="HttpRequestException"/>.
    /// </summary>
    public async Task<HyperAgentVersionResponse> EnsureAsync(CancellationToken ct = default)
    {
        using var resp = await _http.GetAsync("/v1/version", ct);
        resp.EnsureSuccessStatusCode();
        var payload = await resp.Content.ReadFromJsonAsync<HyperAgentVersionResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Hyper Agent /v1/version returned an empty body");

        if (!string.Equals(payload.Version, _expectedVersion, StringComparison.Ordinal))
        {
            _logger.LogError(
                "[hyper-agent] version mismatch: app-server expects {Expected}, hyper-agent reported {Reported} (name={Name})",
                _expectedVersion, payload.Version, payload.Name);
            throw new HyperAgentVersionMismatchException(_expectedVersion, payload.Version, payload.Name);
        }

        _logger.LogInformation(
            "[hyper-agent] version OK: {Version} (name={Name})",
            payload.Version, payload.Name);
        return payload;
    }
}

/// <summary>
/// Raised by <see cref="HyperAgentVersionProbe.EnsureAsync"/> when the
/// Hyper Agent's reported <c>version</c> differs from the App Server's
/// expected value. The fields are exposed so callers (and the integration
/// smoke) can inspect both sides without re-parsing the
/// message string.
/// </summary>
public sealed class HyperAgentVersionMismatchException : Exception
{
    public string ExpectedVersion { get; }
    public string ReportedVersion { get; }
    public string ReportedName { get; }

    public HyperAgentVersionMismatchException(string expected, string reported, string reportedName)
        : base($"Hyper Agent version mismatch: expected '{expected}', reported '{reported}' (name={reportedName})")
    {
        ExpectedVersion = expected;
        ReportedVersion = reported;
        ReportedName = reportedName;
    }
}
