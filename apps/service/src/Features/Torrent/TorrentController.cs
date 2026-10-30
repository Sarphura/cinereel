using Ardalis.Result;
using Ardalis.Result.AspNetCore;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace Cinereel.Features.Torrent;

[ApiController]
[TranslateResultToActionResult]
[Route("api/torrents")]
public sealed class TorrentController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    public async Task<Result<TorrentJobDto>> Add(AddTorrentCommand command, CancellationToken cancellationToken)
        => await mediator.Send(command, cancellationToken);

    [HttpPost("seed")]
    public async Task<Result<TorrentJobDto>> Seed(CreateTorrentCommand command, CancellationToken cancellationToken)
        => await mediator.Send(command, cancellationToken);

    [HttpGet]
    public async Task<Result<IReadOnlyList<TorrentJobDto>>> List(CancellationToken cancellationToken)
        => await mediator.Send(new ListTorrentsQuery(), cancellationToken);

    [HttpPut("{id:guid}/enabled")]
    public async Task<Result<TorrentJobDto>> SetEnabled(Guid id, SetTorrentEnabledCommand command, CancellationToken cancellationToken)
    {
        command.Id = id;
        return await mediator.Send(command, cancellationToken);
    }

    [HttpDelete("{id:guid}")]
    public async Task<Result> Remove(Guid id, bool deleteFiles, CancellationToken cancellationToken)
        => await mediator.Send(new RemoveTorrentCommand { Id = id, DeleteFiles = deleteFiles }, cancellationToken);
}
