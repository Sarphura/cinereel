using CineReel.Service.Infrastructure.Settings;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class CinereelOptionsTests
{
    [Fact]
    public void Env_vars_override_appsettings_values()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), $"cinereel-{Guid.NewGuid():N}");
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["CINEREEL_DATA_DIR"] = dataDir,
                ["Web:ListenPort"] = "8090",
                ["Web__ListenPort"] = "9090",
                ["HyperAgent:BaseUrl"] = "http://127.0.0.1:4201",
            })
            .Build();

        var options = Bind(config);

        Assert.Equal(9090, options.Web.ListenPort);
    }

    [Fact]
    public void Validation_fails_when_data_dir_unset()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["CINEREEL_DATA_DIR"] = string.Empty,
                ["HyperAgent:BaseUrl"] = "not-a-url",
                ["Web:ListenPort"] = "99999",
            })
            .Build();
        var validator = new CinereelOptionsValidator();

        var result = validator.Validate(null, Bind(config));

        Assert.True(result.Failed);
    }

    private static CinereelOptions Bind(IConfiguration configuration)
    {
        CinereelOptions options = new();
        configuration.GetSection(CinereelOptions.SectionName).Bind(options);
        CinereelOptionsServiceCollectionExtensions.ApplyEnvOverride(options, configuration);
        return options;
    }
}
