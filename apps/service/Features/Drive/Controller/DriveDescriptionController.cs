using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives/{driveId}/description")]
public sealed class DriveDescriptionController(IDriveDescriptionService descriptionService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<DriveDescriptionResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DriveDescriptionResponse>> Get(
        string driveId, CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
            return Problem(statusCode: 400, title: "driveId 必须是非空 Guid。");
        var description = await descriptionService.GetAsync(id, cancellationToken);
        return description is null
            ? Problem(statusCode: 404, title: "Drive 不存在。")
            : Ok(description);
    }

    [HttpPut]
    [ProducesResponseType<DriveDescriptionResponse>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<DriveDescriptionResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DriveDescriptionResponse>> Update(
        string driveId, UpdateDriveDescriptionRequest request, CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
            return Problem(statusCode: 400, title: "driveId 必须是非空 Guid。");
        var result = await descriptionService.UpdateAsync(id, request, cancellationToken);
        return result.ResultCode switch
        {
            UpdateDriveDescriptionResultCode.Accepted => AcceptedAtAction(nameof(Get), new { driveId }, result.Description),
            UpdateDriveDescriptionResultCode.Unchanged => Ok(result.Description),
            UpdateDriveDescriptionResultCode.NotFound => Problem(statusCode: 404, title: "Drive 不存在。"),
            UpdateDriveDescriptionResultCode.WriteNotAllowed => Problem(statusCode: 403, title: "只有 DriveOwnership 可以修改公开描述。"),
            UpdateDriveDescriptionResultCode.RevisionConflict => Problem(statusCode: 409, title: "公开描述已经变化，请重新读取后提交。", extensions: new Dictionary<string, object?> { ["code"] = "revision_conflict" }),
            UpdateDriveDescriptionResultCode.Invalid => Problem(statusCode: 400, title: "公开描述字段或 expectedRevision 无效。"),
            _ => throw new ArgumentOutOfRangeException(nameof(result))
        };
    }
}
