using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.Logging;

[ProviderAlias("RotatingFile")]
public sealed class RotatingFileLoggerProvider : ILoggerProvider
{
    private readonly string _directory;
    private readonly TimeProvider _clock;
    private readonly TimeSpan _retention;
    private readonly ConcurrentDictionary<string, RotatingFileLogger> _loggers = new(StringComparer.Ordinal);
    private DateOnly _currentDay;
    private readonly string _applicationName;

    public RotatingFileLoggerProvider(string directory, TimeProvider clock, TimeSpan retention, string applicationName = "cinereel")
    {
        _directory = directory;
        _clock = clock;
        _retention = retention;
        _applicationName = applicationName;
        Directory.CreateDirectory(directory);
        _currentDay = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    }

    public ILogger CreateLogger(string categoryName) => _loggers.GetOrAdd(categoryName, name => new RotatingFileLogger(name, this));

    public void Dispose() => _loggers.Clear();

    public void Write(DateTimeOffset timestamp, string categoryName, LogLevel level, string message)
    {
        RollIfNeeded(timestamp);
        var path = Path.Combine(_directory, $"{_applicationName}.{_currentDay:yyyy-MM-dd}.log");
        var line = $"{timestamp:yyyy-MM-ddTHH:mm:ss.fffZ} [{Abbreviate(level)}] [{categoryName}] {message}{Environment.NewLine}";
        File.AppendAllText(path, line);
    }

    private void RollIfNeeded(DateTimeOffset timestamp)
    {
        var day = DateOnly.FromDateTime(timestamp.UtcDateTime);
        if (day == _currentDay) return;
        _currentDay = day;
        PruneOldFiles();
    }

    private void PruneOldFiles()
    {
        var cutoff = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime).AddDays(-(int)_retention.TotalDays);
        foreach (var file in Directory.EnumerateFiles(_directory, $"{_applicationName}.*.log"))
        {
            var match = Regex.Match(Path.GetFileName(file), $"{Regex.Escape(_applicationName)}\\.(\\d{{4}}-\\d{{2}}-\\d{{2}})\\.log");
            if (!match.Success) continue;
            if (DateOnly.TryParse(match.Groups[1].Value, out var day) && day < cutoff)
            {
                try { File.Delete(file); } catch (IOException) { /* file held by another process; best effort */ }
            }
        }
    }

    private static string Abbreviate(LogLevel level) => level switch
    {
        LogLevel.Trace => "TRC",
        LogLevel.Debug => "DBG",
        LogLevel.Information => "INF",
        LogLevel.Warning => "WRN",
        LogLevel.Error => "ERR",
        LogLevel.Critical => "CRT",
        LogLevel.None => "NON",
        _ => "INF",
    };
}

internal sealed class RotatingFileLogger(string categoryName, RotatingFileLoggerProvider provider) : ILogger
{
    private static readonly Regex DriveKeyPattern = new("(?:[0-9a-fA-F]{64})", RegexOptions.Compiled);

    public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
    public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        if (!IsEnabled(logLevel)) return;
        var message = formatter(state, exception);
        if (exception is not null) message = $"{message}: {exception.Message}";
        provider.Write(DateTimeOffset.UtcNow, categoryName, logLevel, message);
    }

    private sealed class NullScope : IDisposable
    {
        public static readonly NullScope Instance = new();
        public void Dispose() { }
    }
}
