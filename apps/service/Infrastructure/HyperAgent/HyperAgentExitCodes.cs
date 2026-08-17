namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// C# mirror of <c>apps/hyper-agent/src/infrastructure/exit-codes.ts</c>.
/// Each integer MUST stay in lockstep with the TypeScript source and
/// the table in <c>docs/spec/hyper-agent.md</c> (Lifecycle → Exit
/// codes). The constants are the single source of truth for the
/// App Server's spawn-watch loop (see
/// <see cref="HyperAgentExitCodePolicy"/>).
/// </summary>
public static class HyperAgentExitCodes
{
    /// <summary>Clean shutdown after SIGTERM and <c>app.close()</c>.</summary>
    public const int Ok = 0;

    /// <summary>Loopback port already in use.</summary>
    public const int PortInUse = 73;

    /// <summary>Reserved range for future-side failure modes.</summary>
    public const int Reserved74 = 74;

    /// <summary>Reserved range for future-side failure modes.</summary>
    public const int Reserved75 = 75;

    /// <summary>
    /// Version mismatch. The Hyper Agent itself never emits this; the
    /// App Server propagates it after <c>/v1/version</c> does not match
    /// the expected value.
    /// </summary>
    public const int VersionMismatch = 76;

    /// <summary>Corestore directory is missing or unwritable.</summary>
    public const int CorestoreUnavailable = 77;

    /// <summary>DI / NestJS wiring failure during boot.</summary>
    public const int DiFailure = 78;

    /// <summary>drive-index.json is malformed or unreadable.</summary>
    public const int DriveIndexCorrupt = 79;

    /// <summary>Main Hyperdrive failed to open during bootstrap.</summary>
    public const int MainDriveMountFailed = 80;

    /// <summary>
    /// Readiness poll exceeded the budget. The Hyper Agent
    /// never emits this; the App Server sets it after the readiness
    /// watchdog fires.
    /// </summary>
    public const int ReadinessTimeout = 81;
}
