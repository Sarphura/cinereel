using CineReel.Service.Features.Health;
using CineReel.Service.Features.Version;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

// ── Logging: MEL only (ADR 0036) ──────────────────────────────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o =>
{
    o.IncludeScopes = true;
    o.SingleLine = true;
    o.TimestampFormat = "HH:mm:ss.fff ";
});

// ── Hyper Agent client (ADR 0065, ticket 10) ─────────────────────────────────
// The Application Server probes the Hyper Agent's `/v1/version` endpoint
// during startup and refuses to proceed on a mismatch. The probe is
// registered as a transient service so tests can drive it against a
// fake `HttpMessageHandler`. The probe is only invoked below when the
// App Server is configured to talk to a Hyper Agent (i.e.
// `HyperAgent:ExpectedVersion` is set).
var hyperAgentOptions = HyperAgentOptions.Bind(builder.Configuration);
if (!string.IsNullOrWhiteSpace(hyperAgentOptions.ExpectedVersion)
    && hyperAgentOptions.ExpectedVersion != "0.0.0")
{
    builder.Services.AddHttpClient(HyperAgentHttpClient.Name, client =>
    {
        client.BaseAddress = new Uri(hyperAgentOptions.BaseUrl);
        if (!string.IsNullOrWhiteSpace(hyperAgentOptions.SharedToken))
        {
            client.DefaultRequestHeaders.Add("X-Sidecar-Token", hyperAgentOptions.SharedToken);
        }
        client.Timeout = TimeSpan.FromSeconds(5);
    });
    builder.Services.AddSingleton(hyperAgentOptions);
    builder.Services.AddTransient<HyperAgentVersionProbe>(sp =>
    {
        var http = sp.GetRequiredService<IHttpClientFactory>()
            .CreateClient(HyperAgentHttpClient.Name);
        var logger = sp.GetRequiredService<ILoggerFactory>()
            .CreateLogger<HyperAgentVersionProbe>();
        return new HyperAgentVersionProbe(http, hyperAgentOptions.ExpectedVersion, logger);
    });
}

// ── Health checks (ADR 0040) ─────────────────────────────────────────────────
// Required = "service is alive". Sidecar-mount and MonoTorrent-session checks
// are deferred to V1.x when those subsystems land. Each becomes Optional there.
builder.Services
    .AddHealthChecks()
    .AddCheck<SelfHealthCheck>(
        name: "self",
        failureStatus: HealthStatus.Unhealthy,
        tags: ["required"]);

// ── OpenAPI (ADR 0034, supersede pending → ADR 0064) ─────────────────────────
// Microsoft.AspNetCore.OpenApi 10.x emits OpenAPI 3.x JSON at the route
// `/openapi/v1.json` by default; we remap it to `/api/openapi/v1.json`
// to keep the route stable for NSwag / openapi-typescript codegen consumers.
builder.Services.AddOpenApi();

var port = builder.Configuration["Web:ListenPort"] ?? "8090";
var host = builder.Configuration["Web:ListenHost"] ?? "127.0.0.1";
builder.WebHost.UseUrls($"http://{host}:{port}");

var app = builder.Build();

// ── Pre-bind Hyper Agent version probe (ticket 10) ───────────────────────────
// When the App Server is configured to talk to a Hyper Agent, we run the
// version probe BEFORE binding the listener. A mismatch logs both versions
// and exits with the documented code 76 — the operator sees a clear
// signal instead of a downstream `HttpRequestException`.
if (app.Services.GetService<HyperAgentVersionProbe>() is { } probe)
{
    try
    {
        await probe.EnsureAsync();
    }
    catch (HyperAgentVersionMismatchException)
    {
        // Use Environment.Exit because the host has not yet started;
        // app.Lifetime.StopApplication() would not propagate an exit
        // code on the console host. The probe has already logged the
        // mismatch with both versions before throwing.
        Environment.Exit(HyperAgentVersionProbe.ExitCodeVersionMismatch);
    }
}

// ── Pipeline ─────────────────────────────────────────────────────────────────
app.UseRouting();

// Required health check (ADR 0040) — 200/503 only.
app.MapHealthChecks("/health", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("required"),
    AllowCachingResponses = false
});

// Version endpoint (ADR 0033 consumer).
app.MapVersion();

// OpenAPI: emitted at the default route `/openapi/v1.json`.
// ADR 0034 originally specified `/api/swagger/v1.json` on Swashbuckle.
// ADR 0064 supersedes 0034: .NET 10 ships `Microsoft.AspNetCore.OpenApi`
// as the canonical OpenAPI surface, so we use its default route rather
// than re-implement path rewriting.
app.MapOpenApi();

app.Run();

// Exposed for WebApplicationFactory<Program> in tests.
public partial class Program;
