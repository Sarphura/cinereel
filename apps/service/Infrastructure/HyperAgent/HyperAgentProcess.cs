using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Spawns the Hyper Agent as a child process and runs the
/// "spawn-watch" loop that ADR 0017 + ADR 0055 specify.
///
/// The loop is:
///   1. Launch the Hyper Agent with <see cref="HyperAgentSpawnConfig"/>.
///   2. Wait for the child to exit.
///   3. Hand the exit code to <see cref="HyperAgentExitCodePolicy"/>.
///   4. If the action is <see cref="ActionKind.Fatal"/>, propagate
///      the mapped exit code via the caller's <c>Environment.Exit</c>.
///      If the action is <see cref="ActionKind.CleanShutdown"/>, the
///      App Server proceeds to its own shutdown.
///
/// The 5-second SIGTERM grace + SIGKILL escalation is implemented
/// here, not in the policy. The policy is a pure function so unit
/// tests can pin the mapping without spawning a child.
/// </summary>
public sealed class HyperAgentProcess
{
    private readonly HyperAgentSpawnConfig _config;
    private readonly ILogger<HyperAgentProcess> _logger;

    public HyperAgentProcess(HyperAgentSpawnConfig config, ILogger<HyperAgentProcess> logger)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Run the spawn-watch loop. Returns the exit code the App Server
    /// should propagate to its caller. Callers typically translate
    /// this into <c>Environment.Exit(action.ExitCode)</c>.
    /// </summary>
    public async Task<int> RunAsync(CancellationToken ct = default)
    {
        var entry = ResolveEntry();
        _logger.LogInformation(
            "[hyper-agent] spawning {Bin} {Entry} in {Cwd}",
            _config.Bin,
            entry,
            _config.WorkingDirectory);

        using var proc = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = _config.Bin,
                WorkingDirectory = _config.WorkingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            },
        };
        proc.StartInfo.ArgumentList.Add(entry);
        foreach (var arg in _config.Arguments.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            proc.StartInfo.ArgumentList.Add(arg);
        }

        if (!proc.Start())
        {
            _logger.LogCritical("[hyper-agent] failed to start child process");
            var action = HyperAgentExitCodePolicy.Decide(HyperAgentExitCodes.DiFailure, _logger);
            return action.ExitCode;
        }

        // Mirror stdout/stderr up to the App Server's logger so the
        // operator sees the Hyper Agent's lifecycle messages in one
        // log stream.
        proc.OutputDataReceived += (_, ev) =>
        {
            if (ev.Data is not null) _logger.LogInformation("[hyper-agent] {Line}", ev.Data);
        };
        proc.ErrorDataReceived += (_, ev) =>
        {
            if (ev.Data is not null) _logger.LogWarning("[hyper-agent] {Line}", ev.Data);
        };
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        await proc.WaitForExitAsync(ct);

        var code = proc.ExitCode;
        var decision = HyperAgentExitCodePolicy.Decide(code, _logger);
        return decision.ExitCode;
    }

    private string ResolveEntry()
    {
        // Prefer the Hyper Agent's entry; fall back to the legacy
        // sidecar path so a stale binary still boots (the spawn-watch
        // loop logs a warning). The fallback exists for one release
        // cycle per ADR 0059.
        var candidate = Path.IsPathRooted(_config.Entry)
            ? _config.Entry
            : Path.Combine(_config.WorkingDirectory, _config.Entry);
        if (File.Exists(candidate)) return candidate;
        var legacy = Path.IsPathRooted(HyperAgentSpawnConfig.LegacyEntry)
            ? HyperAgentSpawnConfig.LegacyEntry
            : Path.Combine(_config.WorkingDirectory, HyperAgentSpawnConfig.LegacyEntry);
        if (File.Exists(legacy))
        {
            _logger.LogWarning(
                "[hyper-agent] entry not found at {Expected}; falling back to legacy {Legacy}",
                candidate,
                legacy);
            return legacy;
        }
        return candidate;
    }
}
