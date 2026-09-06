using Ardalis.Result.AspNetCore;
using Ardalis.Result;
using Cinereel.Features.Drive;
using Cinereel.Features.SystemInfo;
using Cinereel.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using System.Net;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestLineSize = 16 * 1024);
builder.Services.AddControllers(options => options.AddResultConvention(map => map
    .AddDefaultMap()
    .For(
        ResultStatus.Ok,
        HttpStatusCode.OK,
        options => options.For("put", HttpStatusCode.Created))
    .For(
        ResultStatus.Forbidden,
        HttpStatusCode.Forbidden,
        options => options.With<ProblemDetails>((_, result) => new ProblemDetails
        {
            Title = result.Errors.FirstOrDefault() ?? "当前操作不被允许。"
        }))));
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddSwaggerGen();
builder.Services.AddSystemInfoFeature();
builder.Services.AddPersistence(builder.Configuration);
builder.Services.AddDriveFeature(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();
app.MapSystemInfoFeature();
await app.MigratePersistenceAsync();

app.Run();

public partial class Program;
