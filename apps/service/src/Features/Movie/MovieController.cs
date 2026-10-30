
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Movie;

public sealed class MovieController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(CreateMovieRequestDto request, CancellationToken cancellationToken)
    {
        var command = new CreateMovieCommand
        {
            Title = request.Title,
            Description = request.Description,
            ReleaseYear = request.ReleaseYear,
            Director = request.Director,
            Genre = request.Genre
        };

        await mediator.Send(command, cancellationToken);
        return Ok();
    }
}