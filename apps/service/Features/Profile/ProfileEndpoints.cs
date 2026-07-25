using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Profile;

public static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api/profile").WithTags("Profile");

        group.MapGet("/", async (IProfileService service, HttpContext context, CancellationToken ct) =>
        {
            var mainKey = context.Request.Query["mainDriveKey"].ToString();
            if (string.IsNullOrEmpty(mainKey)) return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "main-drive-required");
            var dto = await service.GetAsync(mainKey, ct);
            return Results.Ok(dto);
        });

        group.MapPut("/", async (ProfileUpdateRequest request, IProfileService service, HttpContext context, CancellationToken ct) =>
        {
            var mainKey = context.Request.Query["mainDriveKey"].ToString();
            if (string.IsNullOrEmpty(mainKey)) return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "main-drive-required");
            try
            {
                var dto = await service.UpdateAsync(mainKey, request, ct);
                return Results.Ok(dto);
            }
            catch (ArgumentException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "invalid-input", detail: ex.Message);
            }
        });

        group.MapPost("/avatar", async (HttpRequest request, IProfileService service, HttpContext context, CancellationToken ct) =>
        {
            var mainKey = context.Request.Query["mainDriveKey"].ToString();
            if (string.IsNullOrEmpty(mainKey)) return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "main-drive-required");
            if (!request.HasFormContentType) return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "multipart-required");
            var form = await request.ReadFormAsync(ct);
            var file = form.Files["file"] ?? form.Files.FirstOrDefault();
            if (file is null) return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "missing-file");
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms, ct);
            try
            {
                var dto = await service.SaveAvatarAsync(mainKey, ms.ToArray(), file.ContentType ?? "image/png", ct);
                return Results.Ok(dto);
            }
            catch (ArgumentException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "invalid-input", detail: ex.Message);
            }
        });

        return endpoints;
    }
}