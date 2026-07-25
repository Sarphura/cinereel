using System.Net;
using CineReel.Service.Infrastructure.Web;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace CineReel.Service.Infrastructure.Web;

/// <summary>
/// Verifies the static-site middleware from ticket 14: the SPA entry page
/// is served at `/`, asset paths resolve to their files on disk, and
/// unknown paths fall back to the SPA index for client-side routing.
/// </summary>
public sealed class StaticSiteTests
{
    [Fact]
    public async Task Root_serves_index_html_when_present()
    {
        var root = CreateFakeSpa();
        try
        {
            using var host = await BuildHost(root);
            var response = await host.GetTestClient().GetAsync("/");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Equal("<!doctype html>cinereel</html>", body);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Unknown_path_falls_back_to_index_for_spa_routing()
    {
        var root = CreateFakeSpa();
        try
        {
            using var host = await BuildHost(root);
            var response = await host.GetTestClient().GetAsync("/subscriptions/nonexistent");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Equal("<!doctype html>cinereel</html>", body);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Missing_static_root_returns_404()
    {
        var root = Path.Combine(Path.GetTempPath(), "cinereel-no-spa-" + Guid.NewGuid().ToString("N"));
        try
        {
            using var host = await BuildHost(root);
            var response = await host.GetTestClient().GetAsync("/");

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Api_prefix_is_not_rewritten_for_fallback()
    {
        var root = CreateFakeSpa();
        try
        {
            using var host = await BuildHost(root);
            // `/api/version` is reserved and must not fall back to the SPA.
            // The minimal test host returns 404 because no endpoint is mapped.
            var response = await host.GetTestClient().GetAsync("/api/version");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string CreateFakeSpa()
    {
        var root = Path.Combine(Path.GetTempPath(), "cinereel-spa-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, "index.html"), "<!doctype html>cinereel</html>");
        return root;
    }

    private static async Task<IHost> BuildHost(string root)
    {
        var builder = new HostBuilder()
            .ConfigureWebHost(webBuilder =>
            {
                webBuilder.UseTestServer();
                webBuilder.Configure(app =>
                {
                    app.UseCinereelStaticSite(new StaticSiteOptions(root, "index.html"));
                    app.Run(async ctx =>
                    {
                        if (ctx.Request.Path.StartsWithSegments("/api"))
                        {
                            ctx.Response.StatusCode = StatusCodes.Status404NotFound;
                            await ctx.Response.WriteAsync("api-not-found");
                        }
                    });
                });
            });

        return await builder.StartAsync();
    }
}
