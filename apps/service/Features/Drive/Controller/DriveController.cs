using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives")]
public sealed class DriveController(IDriveService driveService) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status410Gone)]
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

        var result = await driveService.CreateAsync(
            parsedIdempotencyKey,
            request,
            cancellationToken);

        return result.ResultCode switch
        {
            CreateDriveResultCode.Accepted => AcceptedAtAction(
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

    [HttpPost("{driveId}/creation/retry")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RetryCreation(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "driveId 必须是非空 Guid。");
        }

        var resultCode = await driveService.RetryCreationAsync(
            parsedDriveId,
            cancellationToken);

        return resultCode switch
        {
            RetryDriveCreationResultCode.Accepted => Accepted(),
            RetryDriveCreationResultCode.NotFound => Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Drive 不存在。"),
            RetryDriveCreationResultCode.NotFailed => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "只有创建失败的 Drive 可以重试。"),
            _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
        };
    }

    [HttpPut("{driveId}/remark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateRemark(
        string driveId,
        [FromBody] UpdateDriveRemarkRequest request,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "driveId 必须是非空 Guid。");
        }

        if (!DriveRemark.TryCreate(request.Remark, out var remark))
        {
            return ValidationProblem(new ValidationProblemDetails(
                new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    [nameof(request.Remark)] =
                        [$"remark 去除首尾空白后不能超过 {DriveRemark.MaxLength} 个字符。"]
                }));
        }

        var resultCode = await driveService.UpdateRemarkAsync(
            parsedDriveId,
            remark,
            cancellationToken);

        return resultCode switch
        {
            UpdateDriveRemarkResultCode.Updated => NoContent(),
            UpdateDriveRemarkResultCode.NotFound => Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Drive 不存在或当前 Cinereel 不持有 DriveOwnership。"),
            _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
        };
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
