using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Subscription.Dto;
using CineReel.Service.Features.Subscription.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing;

namespace CineReel.Service.Features.Subscription;
public static class SubscriptionEndpoints
{
    public static IEndpointRouteBuilder MapSubscriptionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api/subscriptions").WithTags("Subscriptions");

        group.MapPost("/", async (HttpContext ctx, CreateSubscriptionRequest request, ISubscriptionService service, CancellationToken ct) =>
        {
            if (request is null || string.IsNullOrWhiteSpace(request.Key) || string.IsNullOrWhiteSpace(request.Type))
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, detail: "key and type are required");
            }

            try
            {
                var sub = request.Type switch
                {
                    "drive" => await service.CreateFromDriveKeyAsync(request.Key, alias: null, ct),
                    "profile" => await service.CreateFromProfileKeyAsync(request.Key, request.Key, ct),
                    _ => throw new SubscriptionServiceException(SubscriptionServiceException.InvalidDriveKey, $"unknown subscription type '{request.Type}'"),
                };

                var response = await service.ToResponseAsync(sub, ct);
                return Results.Created($"/api/subscriptions/{sub.Id}", response);
            }
            catch (SubscriptionServiceException ex) when (ex.Code == SubscriptionServiceException.InvalidDriveKey)
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, detail: ex.Message);
            }
            catch (SubscriptionServiceException ex) when (ex.Code == SubscriptionServiceException.DriveNotMounted)
            {
                return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "drive-not-mounted", detail: ex.Message);
            }
            catch (SubscriptionServiceException ex) when (ex.Code == SubscriptionServiceException.Duplicate)
            {
                return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "duplicate-subscription", detail: ex.Message);
            }
            catch (SubscriptionServiceException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status500InternalServerError, title: ex.Code, detail: ex.Message);
            }
        });

        group.MapGet("/", async (ISubscriptionService service, CancellationToken ct) =>
        {
            var subs = await service.ListAsync(ct);
            var responses = await Task.WhenAll(subs.Select(s => service.ToResponseAsync(s, ct)));
            return Results.Ok(responses);
        });

        group.MapGet("/{id:int}", async (int id, ISubscriptionService service, CancellationToken ct) =>
        {
            var sub = await service.GetAsync(new SubscriptionId(id), ct);
            if (sub is null)
            {
                return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "subscription-not-found");
            }
            var response = await service.ToResponseAsync(sub, ct);
            return Results.Ok(response);
        });

        group.MapDelete("/{id:int}", async (int id, ISubscriptionService service, CancellationToken ct) =>
        {
            var deleted = await service.DeleteAsync(new SubscriptionId(id), ct);
            if (!deleted)
            {
                return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "subscription-not-found");
            }
            return Results.NoContent();
        });

        group.MapPost("/from-profile", async (HttpContext ctx, SubscriptionService_ProfilePickerRequest body, ISubscriptionService service, CancellationToken ct) =>
        {
            if (body is null || string.IsNullOrWhiteSpace(body.ProfileKey) || string.IsNullOrWhiteSpace(body.DriveKey))
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, detail: "profileKey and driveKey are required");
            }

            try
            {
                var picker = await service.ListCollectionsForProfileAsync(body.ProfileKey, ct);
                return Results.Ok(picker);
            }
            catch (SubscriptionServiceException ex) when (ex.Code == SubscriptionServiceException.InvalidDriveKey)
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, detail: ex.Message);
            }
            catch (SubscriptionServiceException ex) when (ex.Code == SubscriptionServiceException.DriveNotMounted)
            {
                return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "drive-not-mounted", detail: ex.Message);
            }
        });

        return endpoints;
    }
}

internal sealed record SubscriptionService_ProfilePickerRequest(string ProfileKey, string DriveKey);
