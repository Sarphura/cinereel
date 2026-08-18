using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Publish;

[ApiController]
[Route("api/published-drives")]
public sealed class PublishController(IPublishService publishService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(PublishDriveResponse[]), StatusCodes.Status200OK)]
    public async Task<ActionResult<PublishDriveResponse[]>> ListAsync(
        CancellationToken cancellationToken)
    {
        var drives = await publishService.ListAsync(cancellationToken);
        var response = drives.Select(PublishDriveResponse.From).ToArray();

        return Ok(response);
    }

    [HttpPost]
    [ProducesResponseType(typeof(PublishDriveResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PublishDriveResponse>> CreateAsync(
        CreatePublishDriveRequest request,
        CancellationToken cancellationToken)
    {
        var command = request.ToCommand();
        var drive = await publishService.CreateAsync(command, cancellationToken);
        var response = PublishDriveResponse.From(drive);

        return Created($"/api/published-drives/{response.DriveKey}", response);
    }
}
