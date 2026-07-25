using System.Diagnostics;
using CineReel.Service.Infrastructure.Settings;
using Microsoft.Extensions.Options;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Optional probe that reaches the operator's Jellyfin server at
/// <c>JELLYFIN_URL/System/Info</c> with a 5-second timeout. The probe is
/// a no-op when Jellyfin is not configured; when configured but down,
/// it surfaces a `degraded` status so operators see it without taking
/// the App Server offline.
/// </summary>
public sealed class JellyfinHealthProbe : IHealthProbe
{
    public string Name => "jellyfin";
    public bool Required => false;

    private readonly IHttpClientFactory _httpFactory;
    private readonly IOptions<CinereelOptions> _options;

    public JellyfinHealthProbe(IHttpClientFactory httpFactory, IOptions<CinereelOptions> options)
    {
        _httpFactory = httpFactory;
        _options = options;
    }

    public async Task<HealthCheckResult> CheckAsync(CancellationToken cancellationToken)
    {
        var url = _options.Value.Jellyfin?.Url;
        if (string.IsNullOrWhiteSpace(url))
        {
            return HealthCheckResult.Healthy(Name, 0, "not configured");
        }

        var sw = Stopwatch.StartNew();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(TimeSpan.FromSeconds(5));
        try
        {
            var http = _httpFactory.CreateClient(JellyfinHttpClient.Name);
            using var response = await http.GetAsync(url.TrimEnd('/') + "/System/Info", cts.Token);
            sw.Stop();
            if (!response.IsSuccessStatusCode)
            {
                return HealthCheckResult.Degraded(Name, sw.ElapsedMilliseconds, "HTTP " + (int)response.StatusCode);
            }
            return HealthCheckResult.Healthy(Name, sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return HealthCheckResult.Degraded(Name, sw.ElapsedMilliseconds, ex.GetType().Name);
        }
    }
}

public static class JellyfinHttpClient
{
    public const string Name = "Jellyfin";
}
