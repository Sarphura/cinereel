using Cinereel.Features.Drive;
using Cinereel.Features.SystemInfo;
using Cinereel.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestLineSize = 16 * 1024);
builder.Services.AddControllers();
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
