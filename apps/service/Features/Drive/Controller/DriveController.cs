using Ardalis.Result;
using Ardalis.Result.AspNetCore;
using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives")]
public sealed class DriveController(IDriveService driveService) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound, ResultStatus.Conflict)]
    public async Task<Result<DriveResponse>> Create(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateDriveRequest request,
        CancellationToken cancellationToken)
    {
        var errors = ValidateCreateRequest(idempotencyKey, request);

        if (errors.Count > 0)
        {
            return Result<DriveResponse>.Invalid(
                errors.SelectMany(pair => pair.Value.Select(message =>
                    new ValidationError(pair.Key, message))));
        }

        IdempotencyKey.TryCreate(idempotencyKey, out var parsedIdempotencyKey);

        return await driveService.CreateAsync(
            parsedIdempotencyKey,
            request,
            cancellationToken);
    }

    [HttpGet("{driveId}")]
    [ProducesResponseType<DriveResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound)]
    public async Task<Result<DriveResponse>> Get(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result<DriveResponse>.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        return await driveService.GetAsync(parsedDriveId, cancellationToken);
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<DriveResponse>>(StatusCodes.Status200OK)]
    [TranslateResultToActionResult]
    public async Task<Result<IReadOnlyList<DriveResponse>>> List(
        CancellationToken cancellationToken)
    {
        return await driveService.ListAsync(cancellationToken);
    }

    [HttpPost("{driveId}/creation/retry")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound, ResultStatus.Conflict)]
    public async Task<Result> RetryCreation(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        return await driveService.RetryCreationAsync(
            parsedDriveId,
            cancellationToken);
    }

    [HttpPut("{driveId}/remark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound)]
    public async Task<Result> UpdateRemark(
        string driveId,
        [FromBody] UpdateDriveRemarkRequest request,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        if (!DriveRemark.TryCreate(request.Remark, out var remark))
        {
            return Result.Invalid(new ValidationError(
                nameof(request.Remark),
                $"remark 去除首尾空白后不能超过 {DriveRemark.MaxLength} 个字符。"));
        }

        return await driveService.UpdateRemarkAsync(
            parsedDriveId,
            remark,
            cancellationToken);
    }

    [HttpDelete("{driveId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound)]
    public async Task<Result> Delete(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var parsedDriveId))
        {
            return Result.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        return await driveService.DeleteAsync(
            parsedDriveId,
            cancellationToken);
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
