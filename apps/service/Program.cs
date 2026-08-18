using Cinereel.Features.SystemInfo;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddSystemInfoFeature();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapSystemInfoFeature();

app.Run();

public partial class Program;
