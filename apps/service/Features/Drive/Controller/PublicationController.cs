using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Drive;

[ApiController]
[Route("api/drives/{driveId}/publication")]
public sealed class PublicationController(IPublishService publishService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PublicationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicationResponse>> GetAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        var publication = await publishService.GetAsync(driveId, cancellationToken);

        return publication is null
            ? Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Publication 不存在")
            : Ok(PublicationResponse.From(publication));
    }

    [HttpPost("publish")]
    [ProducesResponseType<PublicationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<PublicationResponse>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PublicationResponse>> PublishAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        var result = await publishService.PublishAsync(driveId, cancellationToken);
        return ToActionResult(result, driveId);
    }

    [HttpPost("unpublish")]
    [ProducesResponseType<PublicationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<PublicationResponse>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PublicationResponse>> UnpublishAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        var result = await publishService.UnpublishAsync(driveId, cancellationToken);
        return ToActionResult(result, driveId);
    }

    private ActionResult<PublicationResponse> ToActionResult(
        PublicationCommandResult result,
        string driveId)
    {
        if (result.Publication is not null)
        {
            var response = PublicationResponse.From(result.Publication);

            if (result.ResultCode is PublicationCommandResultCode.Accepted)
            {
                return AcceptedAtAction(nameof(GetAsync), new { driveId }, response);
            }

            if (result.ResultCode is PublicationCommandResultCode.Unchanged)
            {
                return Ok(response);
            }
        }

        return result.ResultCode switch
        {
            PublicationCommandResultCode.DriveNotFound => Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Drive 不存在"),
            PublicationCommandResultCode.PublicationNotFound => Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Publication 不存在"),
            PublicationCommandResultCode.Conflict => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Publication 当前状态不允许执行该操作"),
            _ => Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "PublishService 返回了无效结果")
        };
    }
}
