using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives")]
public sealed class SubscriptionController(ISubscriptionService subscriptionService) : ControllerBase
{
    [HttpPost("subscriptions")]
    [ProducesResponseType<DriveDescriptionResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<DriveDescriptionResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity,
        Description = "Manifest 缺失、无效、过大，或 Schema、内容类型不受支持；code 区分原因。")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status504GatewayTimeout)]
    public async Task<ActionResult<DriveDescriptionResponse>> Create(
        CreateSubscriptionRequest request,
        CancellationToken cancellationToken)
    {
        if (!DriveKey.TryCreate(request.DriveKey, out var driveKey))
        {
            return Problem(statusCode: 400, title: "driveKey 必须是有效的 DriveKey。");
        }

        var result = await subscriptionService.CreateAsync(driveKey, cancellationToken);
        return result.ResultCode switch
        {
            CreateSubscriptionResultCode.Created => CreatedAtAction(
                nameof(DriveDescriptionController.Get),
                "DriveDescription",
                new { driveId = result.Description!.DriveId },
                result.Description),
            CreateSubscriptionResultCode.Replayed => Ok(result.Description),
            CreateSubscriptionResultCode.RelationshipConflict => ProtocolProblem(
                409, "relationship_conflict", "该 Drive 已由当前 Cinereel 持有或已经删除，不能建立订阅。"),
            CreateSubscriptionResultCode.ManifestMissing => ManifestMissing(),
            CreateSubscriptionResultCode.InvalidManifest => InvalidManifest(),
            CreateSubscriptionResultCode.ManifestTooLarge => ManifestTooLarge(),
            CreateSubscriptionResultCode.UnsupportedSchema => UnsupportedSchema(),
            CreateSubscriptionResultCode.UnsupportedContentType => UnsupportedContentType(),
            CreateSubscriptionResultCode.ContentUnavailable => ContentUnavailable(),
            CreateSubscriptionResultCode.Timeout => Timeout(),
            _ => throw new ArgumentOutOfRangeException(nameof(result))
        };
    }

    [HttpPost("{driveId}/subscription/refresh")]
    [ProducesResponseType<DriveDescriptionResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity,
        Description = "Manifest 校验失败，保留最近一次有效的公开描述缓存；code 区分原因。")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status504GatewayTimeout)]
    public async Task<ActionResult<DriveDescriptionResponse>> Refresh(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
        {
            return InvalidDriveId();
        }

        var result = await subscriptionService.RefreshAsync(id, cancellationToken);
        return result.ResultCode switch
        {
            RefreshSubscriptionResultCode.Refreshed => Ok(result.Description),
            RefreshSubscriptionResultCode.NotFound => SubscriptionNotFound(),
            RefreshSubscriptionResultCode.ManifestMissing => ManifestMissing(),
            RefreshSubscriptionResultCode.InvalidManifest => InvalidManifest(),
            RefreshSubscriptionResultCode.ManifestTooLarge => ManifestTooLarge(),
            RefreshSubscriptionResultCode.UnsupportedSchema => UnsupportedSchema(),
            RefreshSubscriptionResultCode.UnsupportedContentType => UnsupportedContentType(),
            RefreshSubscriptionResultCode.ContentUnavailable => ContentUnavailable(),
            RefreshSubscriptionResultCode.Timeout => Timeout(),
            _ => throw new ArgumentOutOfRangeException(nameof(result))
        };
    }

    [HttpDelete("{driveId}/subscription")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(string driveId, CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
        {
            return InvalidDriveId();
        }

        var result = await subscriptionService.DeleteAsync(id, cancellationToken);
        return result switch
        {
            DeleteSubscriptionResultCode.Deleted => NoContent(),
            DeleteSubscriptionResultCode.NotFound => SubscriptionNotFound(),
            _ => throw new ArgumentOutOfRangeException(nameof(result))
        };
    }

    private ObjectResult InvalidDriveId() => Problem(statusCode: 400, title: "driveId 必须是非空 Guid。");

    private ObjectResult SubscriptionNotFound() => Problem(statusCode: 404, title: "Subscription 不存在。");

    private ObjectResult ManifestMissing() => ProtocolProblem(422, "manifest_missing", "DriveManifest 不存在。");

    private ObjectResult InvalidManifest() => ProtocolProblem(422, "invalid_manifest", "DriveManifest 无效。");

    private ObjectResult ManifestTooLarge() => ProtocolProblem(422, "manifest_too_large", "DriveManifest 不能超过 64 KiB。");

    private ObjectResult UnsupportedSchema() => ProtocolProblem(422, "unsupported_schema", "DriveManifest Schema 版本不受支持。");

    private ObjectResult UnsupportedContentType() => ProtocolProblem(422, "unsupported_content_type", "DriveManifest 内容类型不受支持。");

    private ObjectResult ContentUnavailable() => ProtocolProblem(503, "content_unavailable", "Drive 内容暂不可用，请稍后重试。");

    private ObjectResult Timeout() => ProtocolProblem(504, "timeout", "读取 DriveManifest 超时，请稍后重试。");

    private ObjectResult ProtocolProblem(int statusCode, string code, string title) => Problem(
        statusCode: statusCode,
        title: title,
        extensions: new Dictionary<string, object?> { ["code"] = code });
}
