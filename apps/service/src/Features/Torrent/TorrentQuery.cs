using Ardalis.Result;
using MediatR;

namespace Cinereel.Features.Torrent;

public sealed class ListTorrentsQuery : IRequest<Result<IReadOnlyList<TorrentJobDto>>>
{
}
