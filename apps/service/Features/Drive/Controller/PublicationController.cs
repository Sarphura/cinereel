using Ardalis.Result;
using Ardalis.Result.AspNetCore;
using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives/{driveId}/publication")]
public sealed class PublicationController(IPublishService publishService) : ControllerBase
{
    [HttpGet]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.NotFound, ResultStatus.CriticalError)]
    public async Task<Result<PublicationResponse>> GetAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        return await publishService.GetAsync(driveId, cancellationToken);
    }

    [HttpPost("publish")]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.NotFound, ResultStatus.Conflict, ResultStatus.CriticalError)]
    public async Task<Result<PublicationResponse>> PublishAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        return await publishService.PublishAsync(driveId, cancellationToken);
    }

    [HttpPost("unpublish")]
    [TranslateResultToActionResult]
    [ExpectedFailures(ResultStatus.NotFound, ResultStatus.Conflict, ResultStatus.CriticalError)]
    public async Task<Result<PublicationResponse>> UnpublishAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        return await publishService.UnpublishAsync(driveId, cancellationToken);
    }
}
