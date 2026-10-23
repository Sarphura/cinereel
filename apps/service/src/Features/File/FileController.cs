using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.File;

public sealed class FileController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(FileCommand command, CancellationToken cancellationToken)
    {
        await mediator.Send(command, cancellationToken);
        return Ok();
    }
}