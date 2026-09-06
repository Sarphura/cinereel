using Ardalis.Result;
using Ardalis.Result.AspNetCore;
using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives")]
public sealed class SubscriptionController(ISubscriptionService subscriptionService) : ControllerBase
{
    [HttpPost("subscriptions")]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.Conflict, ResultStatus.CriticalError)]
    public async Task<Result<DriveDescriptionResponse>> Create(
        CreateSubscriptionRequest request,
        CancellationToken cancellationToken)
    {
        if (!DriveKey.TryCreate(request.DriveKey, out var driveKey))
        {
            return Result<DriveDescriptionResponse>.Invalid(
                new ValidationError("driveKey", "driveKey 必须是有效的 DriveKey。"));
        }

        return await subscriptionService.CreateAsync(driveKey, cancellationToken);
    }

    [HttpPost("{driveId}/subscription/refresh")]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound, ResultStatus.CriticalError)]
    public async Task<Result<DriveDescriptionResponse>> Refresh(
        string driveId,
        CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
        {
            return Result<DriveDescriptionResponse>.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        return await subscriptionService.RefreshAsync(id, cancellationToken);
    }

    [HttpDelete("{driveId}/subscription")]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound)]
    public async Task<Result> Delete(string driveId, CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
        {
            return Result.Invalid(new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        return await subscriptionService.DeleteAsync(id, cancellationToken);
    }
}
