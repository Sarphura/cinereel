using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Cinereel.Features.Drive;

internal sealed class DriveFileOpenApiConfiguration :
    IOperationFilter,
    IOpenApiOperationTransformer
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        if (context.MethodInfo.DeclaringType != typeof(DriveFileController))
        {
            return;
        }

        ConfigureOperation(
            operation,
            string.Equals(
                context.MethodInfo.Name,
                nameof(DriveFileController.AddFile),
                StringComparison.Ordinal));
    }

    public Task TransformAsync(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken cancellationToken)
    {
        if (context.Description.ActionDescriptor is not ControllerActionDescriptor action ||
            action.ControllerTypeInfo.AsType() != typeof(DriveFileController))
        {
            return Task.CompletedTask;
        }

        ConfigureOperation(
            operation,
            string.Equals(
                action.MethodInfo.Name,
                nameof(DriveFileController.AddFile),
                StringComparison.Ordinal));
        return Task.CompletedTask;
    }

    private static void ConfigureOperation(OpenApiOperation operation, bool isAddFile)
    {
        foreach (var parameter in operation.Parameters?.OfType<OpenApiParameter>() ?? [])
        {
            if (parameter.In == ParameterLocation.Query &&
                string.Equals(parameter.Name, "path", StringComparison.Ordinal))
            {
                parameter.Required = true;
            }
        }

        if (isAddFile)
        {
            operation.RequestBody = new OpenApiRequestBody
            {
                Description = "要写入的文件内容。",
                Required = true,
                Content = new Dictionary<string, OpenApiMediaType>(StringComparer.Ordinal)
                {
                    ["application/octet-stream"] = new()
                    {
                        Schema = new OpenApiSchema
                        {
                            Type = JsonSchemaType.String,
                            Format = "binary"
                        }
                    }
                }
            };
        }

        if (operation.Responses is null)
        {
            return;
        }

        foreach (var response in operation.Responses.Where(response =>
                     response.Key.StartsWith('4') || response.Key.StartsWith('5')))
        {
            var content = response.Value.Content;

            if (content is null)
            {
                continue;
            }

            var schema = content
                .Values
                .Select(mediaType => mediaType.Schema)
                .FirstOrDefault(candidate => candidate is not null);
            content.Clear();
            content["application/problem+json"] = new() { Schema = schema };
        }
    }
}
