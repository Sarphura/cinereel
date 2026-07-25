using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;

namespace CineReel.Service.Infrastructure.Logging;

public static class LoggingServiceCollectionExtensions
{
    public static ILoggingBuilder AddCinereelLogging(this ILoggingBuilder builder, string logsDirectory)
    {
        builder.ClearProviders()
            .AddJsonConsole(options =>
            {
                options.IncludeScopes = true;
                options.JsonWriterOptions = new System.Text.Json.JsonWriterOptions { Indented = false };
            })
            .AddProvider(new RotatingFileLoggerProvider(logsDirectory, TimeProvider.System, TimeSpan.FromDays(14)));
        builder.AddFilter<RotatingFileLoggerProvider>(null, LogLevel.Information);
        builder.AddFilter("Microsoft.Extensions.Logging.Console", LogLevel.Information);
        builder.AddFilter("Cinereel.Bt.Engine", LogLevel.Debug);
        builder.AddFilter("Cinereel.HyperAgent.Generated", LogLevel.Warning);
        builder.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
        builder.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
        return builder;
    }
}
