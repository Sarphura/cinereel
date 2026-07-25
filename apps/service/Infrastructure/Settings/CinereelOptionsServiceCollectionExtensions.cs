using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CineReel.Service.Infrastructure.Settings;

public sealed class CinereelOptionsValidator : IValidateOptions<CinereelOptions>
{
    public ValidateOptionsResult Validate(string? name, CinereelOptions options)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(options.DataDir))
        {
            errors.Add("CINEREEL_DATA_DIR must be set");
        }
        else
        {
            try
            {
                Directory.CreateDirectory(options.DataDir);
                if (!Directory.Exists(options.DataDir)) errors.Add($"CINEREEL_DATA_DIR '{options.DataDir}' is not writable");
            }
            catch (Exception exception)
            {
                errors.Add($"CINEREEL_DATA_DIR '{options.DataDir}' cannot be created: {exception.Message}");
            }
        }
        if (!Uri.TryCreate(options.HyperAgent.BaseUrl, UriKind.Absolute, out _))
        {
            errors.Add($"HyperAgent:BaseUrl '{options.HyperAgent.BaseUrl}' is not a valid URL");
        }
        if (options.Web.ListenPort is <= 0 or > 65535)
        {
            errors.Add($"Web:ListenPort must be between 1 and 65535 (got {options.Web.ListenPort})");
        }
        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
}

public static class CinereelOptionsServiceCollectionExtensions
{
    public static IServiceCollection AddCinereelOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<CinereelOptions>()
            .Bind(configuration.GetSection(CinereelOptions.SectionName))
            .PostConfigure(options =>
            {
                ApplyEnvOverride(options, configuration);
            });
        services.AddSingleton<IValidateOptions<CinereelOptions>, CinereelOptionsValidator>();
        return services;
    }

    public static void ApplyEnvOverride(CinereelOptions options, IConfiguration configuration)
    {
        var dataDir = configuration["CINEREEL_DATA_DIR"];
        if (!string.IsNullOrEmpty(dataDir)) options.DataDir = dataDir;
        if (int.TryParse(configuration["SIDECAR_PORT"], out var sidecar)) options.SidecarPort = sidecar;
        var listenHost = configuration["Web:ListenHost"] ?? configuration["Web__ListenHost"];
        if (!string.IsNullOrEmpty(listenHost)) options.Web.ListenHost = listenHost;
        if (int.TryParse(configuration["Web__ListenPort"] ?? configuration["Web:ListenPort"], out var port)) options.Web.ListenPort = port;
        var baseUrl = configuration["HyperAgent:BaseUrl"] ?? configuration["HyperAgent__BaseUrl"];
        if (!string.IsNullOrEmpty(baseUrl)) options.HyperAgent.BaseUrl = baseUrl;
        var tokenFile = configuration["HyperAgent:TokenFile"] ?? configuration["HyperAgent__TokenFile"];
        if (!string.IsNullOrEmpty(tokenFile)) options.HyperAgent.TokenFile = tokenFile;
        var databasePath = configuration["Database:Path"] ?? configuration["Database__Path"];
        if (!string.IsNullOrEmpty(databasePath)) options.Database.Path = databasePath;
        var btDir = configuration["Bt:StagingDir"] ?? configuration["Bt__StagingDir"];
        if (!string.IsNullOrEmpty(btDir)) options.Bt.StagingDir = btDir;
        if (long.TryParse(configuration["Bt:MaxDiskBytes"], out var disk)) options.Bt.MaxDiskBytes = disk;
        if (long.TryParse(configuration["Bt:MaxBandwidthBytesPerSec"], out var bandwidth)) options.Bt.MaxBandwidthBytesPerSec = bandwidth;
        var jellyfinUrl = configuration["Jellyfin:Url"] ?? configuration["Jellyfin__Url"];
        if (!string.IsNullOrEmpty(jellyfinUrl)) options.Jellyfin.Url = jellyfinUrl;
        var jellyfinKey = configuration["Jellyfin:ApiKey"] ?? configuration["Jellyfin__ApiKey"];
        if (!string.IsNullOrEmpty(jellyfinKey)) options.Jellyfin.ApiKey = jellyfinKey;
        var tmdbKey = configuration["Tmdb:ApiKey"] ?? configuration["Tmdb__ApiKey"];
        if (!string.IsNullOrEmpty(tmdbKey)) options.Tmdb.ApiKey = tmdbKey;
    }
}
