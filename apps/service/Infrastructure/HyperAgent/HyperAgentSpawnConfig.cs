using Microsoft.Extensions.Configuration;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Hyper Agent spawn configuration (ADR 0017, ADR 0055).
///
/// The Application Server spawns the Hyper Agent as a child process during
/// startup and waits for `/healthz` to return 200 before proceeding. The
/// spawn contract is parameterised by two environment variables so that
/// the same binary can be run against a packaged production layout or
/// against a dev checkout.
///
///   - <c>HYPER_AGENT_BIN</c>    Path to the <c>node</c> binary that loads
///                               the Hyper Agent entry. Default
///                               <c>"node"</c> (PATH lookup).
///   - <c>HYPER_AGENT_ENTRY</c>  Filesystem path to the Hyper Agent's
///                               compiled entry. Default
///                               <c>"apps/hyper-agent/dist/main.js"</c>
///                               relative to the working directory.
///
/// The pre-rename path (<c>apps/sidecar/dist/main.js</c>) is preserved as
/// a fallback for one release cycle so a stale binary still boots; the
/// spawn-watch loop logs a warning when it does.
/// </summary>
public sealed record HyperAgentSpawnConfig(
    string Bin,
    string Entry,
    string Arguments,
    string WorkingDirectory)
{
    public const string DefaultEntry = "apps/hyper-agent/dist/main.js";
    public const string LegacyEntry = "apps/sidecar/dist/main.js";

    /// <summary>
    /// Read spawn configuration from environment, applying the precedence
    /// rules from ADR 0059 (env wins over appsettings).
    /// </summary>
    public static HyperAgentSpawnConfig FromConfiguration(IConfiguration config)
    {
        var bin = config["HYPER_AGENT_BIN"] ?? "node";
        var entry = config["HYPER_AGENT_ENTRY"] ?? DefaultEntry;
        var arguments = config["HYPER_AGENT_ENTRY_ARGS"]
            ?? "--enable-source-maps";
        var cwd = config["HYPER_AGENT_CWD"]
            ?? Directory.GetCurrentDirectory();
        return new HyperAgentSpawnConfig(bin, entry, arguments, cwd);
    }
}
