using Ardalis.Result;
using Ardalis.Result.AspNetCore;
using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives/{driveId}/description")]
public sealed class DriveDescriptionController(IDriveDescriptionService descriptionService) : ControllerBase
{
    [HttpGet]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.NotFound)]
    public async Task<Result<DriveDescriptionResponse>> Get(
        string driveId, CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
        {
            return Result<DriveDescriptionResponse>.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        return await descriptionService.GetAsync(id, cancellationToken);
    }

    [HttpPut]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.Invalid, ResultStatus.Forbidden, ResultStatus.NotFound, ResultStatus.Conflict)]
    public async Task<Result<DriveDescriptionResponse>> Update(
        string driveId, UpdateDriveDescriptionRequest request, CancellationToken cancellationToken)
    {
        if (!DriveId.TryParse(driveId, out var id))
        {
            return Result<DriveDescriptionResponse>.Invalid(
                new ValidationError("driveId", "driveId 必须是非空 Guid。"));
        }

        return await descriptionService.UpdateAsync(id, request, cancellationToken);
    }
}
