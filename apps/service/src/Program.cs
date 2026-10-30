using Ardalis.Result.AspNetCore;
using Ardalis.Result;
using Cinereel.Features.Movie;
using Cinereel.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
builder.Services.AddDbContext<CinereelDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Cinereel")
        ?? throw new InvalidOperationException("缺少连接字符串 ConnectionStrings:Cinereel。")));
builder.Services.AddMediatR(configuration =>
    configuration.RegisterServicesFromAssemblyContaining<Program>());
builder.Services.AddScoped<IMovieRepository, MovieRepository>();

builder.Services.AddSingleton<TorrentTracker>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<TorrentTracker>());

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

app.Run();

public partial class Program;
