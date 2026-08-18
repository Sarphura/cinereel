using System.Reflection;
using System.Runtime.InteropServices;

namespace Cinereel.Features.SystemInfo;

internal sealed class SystemInfoReader
{
    internal SystemInfoSnapshot Read()
    {
        var assembly = typeof(SystemInfoModule).Assembly;
        var informationalVersion = assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion;

        return new SystemInfoSnapshot(
            Product: "Cinereel",
            Version: informationalVersion ?? assembly.GetName().Version?.ToString() ?? "unknown",
            Runtime: RuntimeInformation.FrameworkDescription);
    }
}

internal sealed record SystemInfoSnapshot(
    string Product,
    string Version,
    string Runtime);
