using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives")]
public sealed class DriveController(IDriveService driveService) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status410Gone)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<DriveResponse>> Create(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateDriveRequest request,
        CancellationToken cancellationToken)
    {
        var errors = ValidateCreateRequest(idempotencyKey, request);

        if (errors.Count > 0)
        {
            return ValidationProblem(new ValidationProblemDetails(errors));
        }

        IdempotencyKey.TryCreate(idempotencyKey, out var parsedIdempotencyKey);

        try
        {
            var result = await driveService.CreateAsync(
                parsedIdempotencyKey,
                request,
                cancellationToken);

            return result.ResultCode switch
            {
                CreateDriveResultCode.Created => CreatedAtAction(
                    nameof(Get),
                    new { driveId = result.Drive!.DriveId },
                    result.Drive),
                CreateDriveResultCode.Replayed => Ok(result.Drive!),
                CreateDriveResultCode.IdempotencyConflict => Problem(
                    statusCode: StatusCodes.Status409Conflict,
                    title: "Idempotency-Key 已用于不同的创建请求。"),
                CreateDriveResultCode.Gone => Problem(
                    statusCode: StatusCodes.Status410Gone,
                    title: "该创建请求对应的 Drive 已被删除。"),
                _ => throw new ArgumentOutOfRangeException(nameof(result))
            };
        }
        catch (HyperClientException)
        {
            return Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "Hyper Client 返回了无效响应。");
        }
        catch (HttpRequestException)
        {
            return Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "无法完成 Hyper Client 请求。");
        }
        catch (DriveCreationRecoveryPendingException)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "上一次 Drive 创建仍在恢复中。");
        }
    }

    [HttpGet("{driveId}")]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DriveResponse>> Get(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "driveId 必须是非空 Guid。");
        }

        var drive = await driveService.GetAsync(parsedDriveId, cancellationToken);

        return drive is null
            ? Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Drive 不存在。")
            : Ok(drive);
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<DriveResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DriveResponse>>> List(
        CancellationToken cancellationToken)
    {
        var drives = await driveService.ListAsync(cancellationToken);
        return Ok(drives);
    }

    [HttpDelete("{driveId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "driveId 必须是非空 Guid。");
        }

        var resultCode = await driveService.DeleteAsync(
            parsedDriveId,
            cancellationToken);

        return resultCode switch
        {
            DeleteDriveResultCode.Deleted => NoContent(),
            DeleteDriveResultCode.NotFound => Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Drive 不存在或当前 Cinereel 不持有 DriveOwnership。"),
            _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
        };
    }

    private static Dictionary<string, string[]> ValidateCreateRequest(
        string? idempotencyKey,
        CreateDriveRequest request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);

        if (!IdempotencyKey.TryCreate(idempotencyKey, out _))
        {
            errors["Idempotency-Key"] =
                ["Idempotency-Key 必须包含 1 到 128 个可见 ASCII 字符。"];
        }

        if (!DriveName.TryCreate(request.Name, out _))
        {
            errors[nameof(request.Name)] =
                ["name 去除首尾空白后必须包含 1 到 200 个字符。"];
        }

        if (!DriveContentTypeId.TryCreate(request.ContentTypeId, out _))
        {
            errors[nameof(request.ContentTypeId)] =
                ["contentTypeId 不是当前支持的 Drive 内容类型。"];
        }

        return errors;
    }
}
