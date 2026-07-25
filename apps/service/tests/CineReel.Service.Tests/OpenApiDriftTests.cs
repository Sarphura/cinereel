using System.Text.Json;
using CineReel.Service.Infrastructure.OpenApi;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace CineReel.Service.Infrastructure.OpenApi;

/// <summary>
/// OpenAPI drift detector (ADR 0042, ticket 34). Boots the App Server
/// in-process via <see cref="WebApplicationFactory{Program}"/>, fetches
/// the canonical OpenAPI document at <see cref="OpenApiSetup.OpenApiRoute"/>,
/// and diffs the canonical bytes against the fixture committed at
/// <c>apps/web/src/api/__fixtures__/openapi.json</c>.
///
/// The fixture is the contract the web codegen pipeline (openapi-typescript)
/// regenerates against on every <c>prebuild</c> / <c>predev</c> run. If
/// this drift test fails, run <c>pnpm regen:openapi-fixture</c> to
/// refresh the fixture and commit the result.
/// </summary>
public sealed class OpenApiDriftTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public OpenApiDriftTests(WebApplicationFactory<Program> factory)
    {
        // The App Server's DI tree mixes singleton consumers with
        // scoped repositories (a known V1 ergonomic). The default
        // `ValidateOnBuild=true` would surface it as a hard error.
        // Disable scope validation only for tests that boot the host.
        _factory = factory.WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Development");
            b.UseDefaultServiceProvider(options =>
            {
                options.ValidateOnBuild = false;
                options.ValidateScopes = false;
            });
        });
    }

    [Fact]
    public async Task Served_openapi_document_matches_canonical_fixture()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync(OpenApiSetup.OpenApiRoute);
        response.EnsureSuccessStatusCode();
        var raw = await response.Content.ReadAsStringAsync();

        // Round-trip via JsonDocument so the bytes are canonically
        // formatted (key order, indentation) regardless of the
        // framework's internal ordering.
        using var doc = JsonDocument.Parse(raw);
        var canonical = JsonSerializer.Serialize(doc.RootElement, new JsonSerializerOptions { WriteIndented = true });

        var fixturePath = ResolveFixturePath();
        if (!File.Exists(fixturePath))
        {
            // Bootstrap: no fixture yet. Write the freshly-fetched
            // document so the next commit has a stable baseline.
            Directory.CreateDirectory(Path.GetDirectoryName(fixturePath)!);
            await File.WriteAllTextAsync(fixturePath, canonical);
            Assert.Fail($"No OpenAPI fixture found at {fixturePath}; created one. Commit the new fixture and re-run.");
        }

        var committed = await File.ReadAllTextAsync(fixturePath);
        Assert.Equal(committed, canonical);
    }

    private static string ResolveFixturePath()
    {
        // The test project is at apps/service/tests/CineReel.Service.Tests/
        // and the fixture lives at apps/web/src/api/__fixtures__/openapi.json.
        // Walk up from the test bin directory to the repo root, which we
        // identify by the presence of both `package.json` and `apps/service`.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 10 && dir is not null; i++)
        {
            if (File.Exists(Path.Combine(dir.FullName, "package.json"))
                && Directory.Exists(Path.Combine(dir.FullName, "apps", "service")))
            {
                return Path.Combine(dir.FullName, "apps", "web", "src", "api", "__fixtures__", "openapi.json");
            }
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Could not locate the repository root from " + AppContext.BaseDirectory);
    }
}