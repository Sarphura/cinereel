using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;

namespace CineReel.Service.Infrastructure.Web;

/// <summary>
/// Wires the SPA surface from ADR 0022: serves the contents of
/// <c>Web:StaticRoot</c> at the URL root, with a fallback rewrite of
/// unknown paths back to <c>Web:SpaIndex</c> for client-side routing.
/// The single port is <c>Web:ListenPort</c>; the SPA, the JSON API, and
/// the health endpoint all share it. TLS termination is the operator's
/// reverse proxy; this server does not ship TLS.
/// </summary>
public static class StaticSiteSetup
{
    public static IApplicationBuilder UseCinereelStaticSite(this IApplicationBuilder app, StaticSiteOptions options)
    {
        var absoluteRoot = ToAbsolute(options.StaticRoot);
        var indexPath = Path.Combine(absoluteRoot, options.SpaIndex);

        if (Directory.Exists(absoluteRoot) && File.Exists(indexPath))
        {
            var provider = new PhysicalFileProvider(absoluteRoot);
            app.UseDefaultFiles(new DefaultFilesOptions
            {
                FileProvider = provider,
                DefaultFileNames = { options.SpaIndex },
            });
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = provider,
                ServeUnknownFileTypes = true,
            });
        }

        app.Use(async (context, next) =>
        {
            var path = context.Request.Path.Value ?? "/";
            var methodAllowsFallback = HttpMethods.IsGet(context.Request.Method);
            var pathReserved = path.StartsWith("/api", StringComparison.OrdinalIgnoreCase)
                            || path.StartsWith("/health", StringComparison.OrdinalIgnoreCase);

            if (!methodAllowsFallback || pathReserved)
            {
                await next();
                return;
            }

            if (!File.Exists(indexPath))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                await context.Response.WriteAsync("SPA bundle not present at " + absoluteRoot);
                return;
            }

            var physical = Path.Combine(absoluteRoot, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            var requestedHasExtension = path.Contains('.');
            if (requestedHasExtension && !File.Exists(physical))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            context.Response.ContentType = "text/html; charset=utf-8";
            await context.Response.SendFileAsync(indexPath);
        });

        return app;
    }

    private static string ToAbsolute(string root)
    {
        if (string.IsNullOrWhiteSpace(root)) return string.Empty;
        if (Path.IsPathRooted(root)) return root;
        return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, root));
    }
}

/// <summary>
/// Subset of <c>CinereelOptions.Web</c> the static-site middleware
/// cares about. Tests pass concrete values without binding the whole
/// configuration tree.
/// </summary>
public sealed record StaticSiteOptions(string StaticRoot, string SpaIndex);
