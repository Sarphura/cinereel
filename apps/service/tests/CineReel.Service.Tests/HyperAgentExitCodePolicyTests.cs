using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CineReel.Service.Tests;

/// <summary>
/// Pin the per-exit-code action table from ticket 16. Each
/// documented exit code MUST map to a documented action and a
/// documented exit code. The App Server's spawn-watch loop relies
/// on this table; if the table changes, the operator-visible
/// behaviour changes, so the changes go through code review.
/// </summary>
public class HyperAgentExitCodePolicyTests
{
    [Theory]
    [InlineData(HyperAgentExitCodes.PortInUse, "loopback port already in use", HyperAgentExitCodes.PortInUse)]
    [InlineData(HyperAgentExitCodes.CorestoreUnavailable, "Corestore", HyperAgentExitCodes.CorestoreUnavailable)]
    [InlineData(HyperAgentExitCodes.DiFailure, "DI", HyperAgentExitCodes.DiFailure)]
    [InlineData(HyperAgentExitCodes.DriveIndexCorrupt, "drive-index", HyperAgentExitCodes.DriveIndexCorrupt)]
    [InlineData(HyperAgentExitCodes.MainDriveMountFailed, "main Hyperdrive", HyperAgentExitCodes.MainDriveMountFailed)]
    [InlineData(HyperAgentExitCodes.VersionMismatch, "version mismatch", HyperAgentExitCodes.VersionMismatch)]
    [InlineData(HyperAgentExitCodes.ReadinessTimeout, "readiness timeout", HyperAgentExitCodes.ReadinessTimeout)]
    [InlineData(42, "unrecognised exit code 42", 42)]
    public void Classify_MapsEachCodeToItsAction(
        int code, string reasonSubstring, int expectedExitCode)
    {
        var (reason, action) = HyperAgentExitCodePolicy.Classify(code);

        Assert.Equal(expectedExitCode, action.ExitCode);
        Assert.Equal(ActionKind.Fatal, action.Kind);
        Assert.Contains(reasonSubstring, reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Ok_Is_CleanShutdown()
    {
        var (reason, action) = HyperAgentExitCodePolicy.Classify(HyperAgentExitCodes.Ok);

        Assert.Equal(ActionKind.CleanShutdown, action.Kind);
        Assert.Equal(HyperAgentExitCodes.Ok, action.ExitCode);
        Assert.Contains("clean shutdown", reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Decide_LogsFatalLineWithCodeAndReason()
    {
        var sink = new TestLogger();
        var action = HyperAgentExitCodePolicy.Decide(
            HyperAgentExitCodes.DriveIndexCorrupt, sink);

        Assert.Equal(ActionKind.Fatal, action.Kind);
        var entry = sink.Entries.Single();
        Assert.Equal(LogLevel.Critical, entry.Level);
        Assert.Contains("FATAL: hyper-agent exit", entry.Message);
        Assert.Contains(HyperAgentExitCodes.DriveIndexCorrupt.ToString(), entry.Message);
        Assert.Contains("drive-index", entry.Message);
    }

    [Fact]
    public void Decide_LogsFatalLineForUnknownCode()
    {
        var sink = new TestLogger();
        var action = HyperAgentExitCodePolicy.Decide(99, sink);

        Assert.Equal(ActionKind.Fatal, action.Kind);
        Assert.Equal(99, action.ExitCode);
        var entry = sink.Entries.Single();
        Assert.Contains("99", entry.Message);
        Assert.Contains("unrecognised", entry.Message);
    }

    private sealed class TestLogger : ILogger
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
