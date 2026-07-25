using CineReel.Service.Features.Health;
using CineReel.Service.Features.Version;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.OpenApi;
using CineReel.Service.Infrastructure.Settings;
using CineReel.Service.Infrastructure.Web;
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
var hyperAgentOptions = CineReel.Service.Infrastructure.HyperAgent.HyperAgentOptions.Bind(builder.Configuration);
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
    builder.Services.AddTransient<HyperAgentClient>(sp =>
    {
        var http = sp.GetRequiredService<IHttpClientFactory>()
            .CreateClient(HyperAgentHttpClient.Name);
        var logger = sp.GetRequiredService<ILoggerFactory>()
            .CreateLogger<HyperAgentClient>();
        return new HyperAgentClient(http, logger);
    });
    builder.Services.AddTransient<IHyperAgentClient>(sp =>
        sp.GetRequiredService<HyperAgentClient>());

    // Subscription recovery (ticket 17): the App Server replays
    // every persisted subscription after the Hyper Agent recovers
    // from a restart. The watcher is the IHostedService that fires
    // the recovery event when /healthz + /v1/version both succeed.
    builder.Services.AddSingleton<InMemorySubscriptionStore>();
    builder.Services.AddSingleton<ISubscriptionStore>(sp =>
        sp.GetRequiredService<InMemorySubscriptionStore>());
    builder.Services.AddTransient<SubscriptionRecoveryService>(sp =>
    {
        var client = sp.GetRequiredService<IHyperAgentClient>();
        var store = sp.GetRequiredService<ISubscriptionStore>();
        var logger = sp.GetRequiredService<ILoggerFactory>()
            .CreateLogger<SubscriptionRecoveryService>();
        return new SubscriptionRecoveryService(client, store, logger);
    });
    builder.Services.AddHostedService<HyperAgentReadinessWatcher>(sp =>
    {
        var client = sp.GetRequiredService<IHyperAgentClient>();
        var recovery = sp.GetRequiredService<SubscriptionRecoveryService>();
        var logger = sp.GetRequiredService<ILoggerFactory>()
            .CreateLogger<HyperAgentReadinessWatcher>();
        return new HyperAgentReadinessWatcher(client, hyperAgentOptions.ExpectedVersion, recovery, logger);
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

// ── OpenAPI (ADR 0064) ─────────────────────────────────────────────────────────
// Microsoft.AspNetCore.OpenApi 10.x emits OpenAPI 3.x JSON. The default
// route is `/openapi/v1.json`; we re-register it as `/api/openapi/v1.json`
// to keep the URL family consistent with `/api/*` and to give the codegen
// consumer (ticket 14) a stable URL. Dev-only Swagger UI lives at
// `/api/openapi/ui` (Development environment only).
builder.Services.AddCinereelOpenApi();

// Health aggregator (ADR 0040, ticket 15). The custom probes register
// alongside the framework's required `SelfHealthCheck` so the legacy
// `/health` endpoint keeps working unchanged.
builder.Services.AddCinereelHealth();

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

// Full health aggregator (ticket 15) — lists every probe.
app.MapHealthEndpoints();

// Version endpoint (ADR 0033 consumer).
app.MapVersion();

// OpenAPI: emitted at the documented stable route `/api/openapi/v1.json`.
// The default framework route (`/openapi/v1.json`) is suppressed; the web
// codegen consumer in ticket 14 reads from the remapped URL.
app.MapCinereelOpenApi();

// ── SPA host (ADR 0022, ticket 14) ────────────────────────────────────────────
// Static files from `Web:StaticRoot` are served at `/`; unknown routes
// fall back to `Web:SpaIndex` for client-side routing. The path root
// resolved from `CinereelOptions` after `AddCinereelOptions` validated
// startup configuration.
var webOptions = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<CinereelOptions>>().Value.Web;
app.UseCinereelStaticSite(new StaticSiteOptions(webOptions.StaticRoot, webOptions.SpaIndex));

app.Run();

// Exposed for WebApplicationFactory<Program> in tests.
public partial class Program;
