using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Per-exit-code action table for the App Server's spawn-watch loop.
///
/// When the Hyper Agent child process exits, the App Server must take
/// one of three actions: log-and-restart, log-and-fatal, or
/// log-and-fatal-with-mapped-code. The mapping lives here so a new
/// contributor can answer "Hyper Agent exited with code N, what
/// happens next?" from one place. The table is the contract; the
/// loop in <see cref="HyperAgentProcess"/> is the executor.
///
/// The 5-second shutdown grace period and SIGKILL escalation are
/// unchanged from ADR 0055 — this class only decides what to do
/// AFTER the process has exited.
/// </summary>
public static class HyperAgentExitCodePolicy
{
    /// <summary>
    /// Decide what to do when the Hyper Agent child process exits
    /// with <paramref name="code"/>. Always logs a FATAL line that
    /// names the exit code and the reason; returns the action the
    /// caller must take.
    /// </summary>
    public static HyperAgentExitAction Decide(
        int code,
        ILogger logger)
    {
        var (reason, action) = Classify(code);
        // Per ticket 16: every branch logs
        // "FATAL: hyper-agent exit <code>: <reason>".
        logger.LogCritical(
            "FATAL: hyper-agent exit {Code}: {Reason}",
            code,
            reason);
        return action;
    }

    /// <summary>
    /// Pure classification used by <see cref="Decide"/> and by the
    /// unit tests (which assert the mapping without going through a
    /// logger).
    /// </summary>
    public static (string Reason, HyperAgentExitAction Action) Classify(int code)
    {
        switch (code)
        {
            case HyperAgentExitCodes.PortInUse:
                return (
                    "loopback port already in use (SIDECAR_PORT)",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        HyperAgentExitCodes.PortInUse));

            case HyperAgentExitCodes.CorestoreUnavailable:
                return (
                    "Corestore missing or unwritable",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        HyperAgentExitCodes.CorestoreUnavailable));

            case HyperAgentExitCodes.DiFailure:
                return (
                    "DI / NestJS wiring failure",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        HyperAgentExitCodes.DiFailure));

            case HyperAgentExitCodes.DriveIndexCorrupt:
                return (
                    "drive-index.json corrupt",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        HyperAgentExitCodes.DriveIndexCorrupt));

            case HyperAgentExitCodes.MainDriveMountFailed:
                return (
                    "main Hyperdrive failed to open",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        HyperAgentExitCodes.MainDriveMountFailed));

            case HyperAgentExitCodes.VersionMismatch:
                // Already propagated by HyperAgentVersionProbe; the
                // watchdog should not see this code in practice but
                // if it does, fatal with the same code.
                return (
                    "version mismatch (App Server propagates)",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        HyperAgentExitCodes.VersionMismatch));

            case HyperAgentExitCodes.ReadinessTimeout:
                return (
                    "readiness timeout (App Server propagates)",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        HyperAgentExitCodes.ReadinessTimeout));

            case HyperAgentExitCodes.Ok:
                return (
                    "clean shutdown (SIGTERM after app.close())",
                    new HyperAgentExitAction(
                        ActionKind.CleanShutdown,
                        HyperAgentExitCodes.Ok));

            default:
                // Generic fatal: log the unknown code and propagate
                // it as-is so the operator can correlate with the
                // Hyper Agent's stderr.
                return (
                    $"unrecognised exit code {code}",
                    new HyperAgentExitAction(
                        ActionKind.Fatal,
                        code));
        }
    }
}

/// <summary>
/// What the App Server should do after the Hyper Agent exits.
/// </summary>
public enum ActionKind
{
    /// <summary>Hyper Agent exited cleanly; the App Server proceeds to its own shutdown.</summary>
    CleanShutdown,
    /// <summary>
    /// Hyper Agent exited with a fatal error; the App Server logs the
    /// reason and exits with the mapped code.
    /// </summary>
    Fatal,
}

/// <summary>
/// Result of <see cref="HyperAgentExitCodePolicy.Classify"/> /
/// <see cref="HyperAgentExitCodePolicy.Decide"/>.
/// </summary>
public sealed record HyperAgentExitAction(ActionKind Kind, int ExitCode);
